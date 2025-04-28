# vectorize_and_index.py

import os
import json
import time
import openai
import psycopg2
from dotenv import load_dotenv
from supabase import create_client, Client

# === Load ENV ===
load_dotenv()

DB_HOST = os.getenv("SUPABASE_DB_HOST")
DB_NAME = os.getenv("SUPABASE_DB_NAME")
DB_USER = os.getenv("SUPABASE_DB_USER")
DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD")
DB_PORT = int(os.getenv("SUPABASE_DB_PORT", 5432))
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_EMBEDDING_TABLE = os.getenv("SUPABASE_EMBEDDING_TABLE", "product_embeddings")

openai.api_key = os.getenv("OPENAI_API_KEY")

# === Connect to Supabase ===
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# === Connect to Supabase Postgres ===
conn = psycopg2.connect(
    host=DB_HOST,
    dbname=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD,
    port=DB_PORT,
    sslmode="require"
)
cursor = conn.cursor()

# === Rate Limit Settings ===
TPM_LIMIT = 800_000
SAFETY_BUFFER = 10_000

# === Get Embedding Function ===
def get_embedding(text, model="text-embedding-3-small"):
    try:
        response = openai.embeddings.create(
            input=text,
            model=model
        )
        return response.data[0].embedding, response.usage.total_tokens
    except Exception as e:
        print(f"❌ Failed to get embedding: {e}")
        return None, 0

# === Process and Index in Batches ===
def vectorize_products(batch_size=50):
    offset = 0
    total_tokens = 0
    tpm_window_start = time.time()
    tpm_tokens_used = 0
    start_time = time.time()

    while True:
        cursor.execute('''
            SELECT id, parent_sku, title, brand, color, category, description
            FROM product_catalog
            OFFSET %s LIMIT %s
        ''', (offset, batch_size))

        rows = cursor.fetchall()
        if not rows:
            break

        for row in rows:
            product_id, parent_sku, title, brand, color, category, description = row
            text_input = f"Title: {title}\nBrand: {brand}\nColor: {color}\nCategory: {category}\nDescription: {description}"

            embedding, tokens_used = get_embedding(text_input)

            # === TPM Rate Limiting ===
            tpm_tokens_used += tokens_used
            if tpm_tokens_used > (TPM_LIMIT - SAFETY_BUFFER):
                elapsed = time.time() - tpm_window_start
                sleep_time = 60 - elapsed
                if sleep_time > 0:
                    print(f"⏸️ Sleeping for {sleep_time:.2f}s to respect TPM limit")
                    time.sleep(sleep_time)
                tpm_window_start = time.time()
                tpm_tokens_used = 0

            total_tokens += tokens_used

            if embedding is None:
                print(f"🚫 Skipping {parent_sku} due to failed embedding")
                continue

            try:
                cursor.execute(f'''
                    INSERT INTO {SUPABASE_EMBEDDING_TABLE} (product_id, metadata, embedding)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (product_id) DO UPDATE SET metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding
                ''', (
                    product_id,
                    json.dumps({
                        "parent_sku": parent_sku,
                        "title": title,
                        "brand": brand,
                        "color": color,
                        "category": category,
                        "description": description
                    }),
                    embedding
                ))
                conn.commit()
                print(f"✅ Indexed {parent_sku}")
            except Exception as e:
                print(f"❌ Failed to insert embedding for {parent_sku}: {e}")
                conn.rollback()

        offset += batch_size
        elapsed = time.time() - start_time
        cost_so_far = (total_tokens / 1_000_000) * 0.1
        print(f"⏳ Processed {offset} rows in {elapsed / 60:.2f} min — Cost so far: ${cost_so_far:.2f}")

    conn.close()

if __name__ == "__main__":
    vectorize_products(batch_size=50)
