import os
import csv
import time
import json
import unicodedata
import requests
import aiohttp
import asyncio
import psycopg2
from urllib.parse import urlparse
from dotenv import load_dotenv

start_time = time.time()
print("\n🚀 Script started", flush=True)

# === Helpers ===
def clean_text(text):
    return unicodedata.normalize("NFKC", str(text or "")).strip()

# === Load ENV ===
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

DB_HOST = os.getenv("SUPABASE_DB_HOST")
DB_NAME = os.getenv("SUPABASE_DB_NAME")
DB_USER = os.getenv("SUPABASE_DB_USER")
DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD")
DB_PORT = int(os.getenv("SUPABASE_DB_PORT", 5432))

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

# === Download and Parse CSV ===
catalog_url = "https://storage.googleapis.com/product_catalog_my_ae/product_catalog.csv"
print(f"📦 Downloading catalog from {catalog_url}...", flush=True)
csv_response = requests.get(catalog_url)
csv_response.raise_for_status()
csv_content = csv_response.text
print("✅ Catalog loaded into memory", flush=True)

csv_reader = csv.DictReader(csv_content.splitlines())
rows = list(csv_reader)
for row in rows:
    for k in list(row.keys()):
        if k is None:
            continue
        row[k.strip().lower().replace(" ", "_")] = row.pop(k)

# === Fetch already-inserted SKUs ===
cursor.execute('SELECT parent_sku FROM "product_catalog"')
existing_skus = set(r[0] for r in cursor.fetchall())

# === Error Log ===
failed_log = open("failed_rows.txt", "a")

# === OpenAI async call with retry ===
async def call_gpt(session, prompt, retries=5):
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2
    }
    for attempt in range(retries):
        async with session.post("https://api.openai.com/v1/chat/completions", headers=headers, json=data) as resp:
            result = await resp.json()
            if 'error' in result:
                message = result['error']['message']
                if 'Rate limit' in message or 'Request too large' in message:
                    wait_time = 1 + attempt * 2
                    print(f"⏳ Rate limit hit or request too large. Retrying in {wait_time}s...", flush=True)
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise ValueError(f"Invalid response from OpenAI: {result}")
            if 'choices' not in result:
                raise ValueError(f"Invalid response from OpenAI: {result}")
            content = result['choices'][0]['message']['content'].strip()
            if content.startswith("```"):
                content = content.replace("```json", "").replace("```", "").strip()
            return json.loads(content)
    raise ValueError(f"Failed after {retries} retries: {result}")

# === Label and insert ===
async def label_batch(session, batch, batch_start):
    batched_prompt_lines = []
    for i, row in enumerate(batch):
        row["title"] = clean_text(row.get("title"))
        row["description"] = clean_text(row.get("description"))
        batched_prompt_lines.append(
            f"{i+1}. Title: {row['title']}\nDescription: {row['description']}"
        )

    prompt = f"""
You are a fashion labeling assistant.

You will be shown a list of {len(batch)} products, each with a catalog title and description. For each product, analyze ONLY the product being sold (as described in the title/description), and ignore any other items that may appear in an image.

Return an array of {len(batch)} JSON objects. Each object should be structured exactly like this:

- description_ai: A clean, rewritten version of the original description that is short, accurate, and clear. Remain neutral in descriptions and avoid styling tips, occasion suggestions, or subjective opinions. Do not include “ideal for” or “style with…” language.
- style_details: A short list of 2–10 descriptive tags like ["boxy fit", "ribbed", "high neckline", "cropped", "wool knit"]. These help describe silhouette, material, finish, and construction.
- items_detected: A single item object, parsed as:
  {{
    type: (e.g., "t-shirt", "jeans", "blazer"),
    color: (e.g., "black", "light wash", "camel"),
    material: (e.g., "cotton", "nylon blend", "silk"),
    style: (e.g., "oversized", "cargo", "bootcut", "cropped")
  }}
- metadata: Any additional insights useful for semantic search, such as neckline, length, construction, fastenings, fit, etc. Return this as a key-value object, not a paragraph.

Descriptions must remain neutral, accurate, and concise. Avoid styling tips, occasion suggestions, or subjective opinions. Do not include "ideal for" or "style with..." language. Make sure the output is structured JSON array only, with no other text.

Here are the {len(batch)} products:
{chr(10).join(batched_prompt_lines)}
"""

    try:
        results = await call_gpt(session, prompt)
    except Exception as e:
        msg = f"GPT call failed for batch starting at row {batch_start+1}: {e}\n"
        print(f"❌ {msg}", flush=True)
        failed_log.write(msg)
        return

    values_to_insert = []
    for i, result in enumerate(results):
        row = batch[i]
        try:
            values_to_insert.append((
                row.get("parent_sku"),
                row.get("color_sku"),
                row.get("size_sku"),
                row.get("image_url"),
                json.loads(row.get("additional_images") or "[]"),
                row.get("page_url"),
                row.get("title"),
                row.get("description"),
                row.get("category"),
                row.get("gender"),
                row.get("age_group"),
                float(row["price"]) if row.get("price") not in [None, ""] else None,
                float(row["original_price"]) if row.get("original_price") not in [None, ""] else None,
                int(row["stock_availability"]) if row.get("stock_availability") not in [None, ""] else None,
                row.get("brand"),
                row.get("currency"),
                row.get("color"),
                row.get("size"),
                result.get("description_ai"),
                json.dumps(result.get("style_details")),
                json.dumps(result.get("items_detected")),
                json.dumps(result.get("metadata"))
            ))
        except Exception as e:
            msg = f"Failed to prepare row {batch_start + i + 1}: {e}\n"
            print(f"❌ {msg}", flush=True)
            failed_log.write(msg)

    try:
        cursor.executemany("""
            INSERT INTO product_catalog (
                parent_sku, color_sku, size_sku, image_url, additional_images, page_url,
                title, description, category, gender, age_group,
                price, original_price, stock_availability, brand, currency, color, size,
                description_ai, style_details, items_detected, metadata
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, values_to_insert)
        conn.commit()
    except Exception as e:
        msg = f"Failed to insert batch at row {batch_start + 1}: {e}\n"
        print(f"❌ {msg}", flush=True)
        failed_log.write(msg)
        conn.rollback()

    elapsed = time.time() - start_time
    processed = batch_start + len(batch)
    total = len(rows)
    avg_time_per_row = elapsed / processed
    remaining = total - processed
    eta_seconds = remaining * avg_time_per_row
    eta_hours = int(eta_seconds // 3600)
    eta_minutes = int((eta_seconds % 3600) // 60)

    # Live cost tracking (based on processed tokens)
    tokens_so_far = processed * 250
    cost_so_far = (tokens_so_far / 1_000_000) * 5
    cost_per_million = (len(batch) * 250 / 1_000_000) * 5

    print(f"⏳ Processed {processed} rows in {elapsed:.2f}s — ETA: {eta_hours}h {eta_minutes}m remaining", flush=True)
    print(f"💸 Cost so far: ${cost_so_far:.2f} | Current cost per million tokens: ${cost_per_million:.2f}", flush=True)

# === Async semaphore wrapper ===
semaphore = asyncio.Semaphore(6)  # increased concurrency to better utilize 800k TPM limit  # limit to 4 concurrent batches

async def throttled_label_batch(session, batch, batch_start):
    async with semaphore:
        await label_batch(session, batch, batch_start)

# === Main loop ===
async def main():
    batch_size = 125  # ~125 products × 250 tokens ≈ 31,250 tokens per batch
    tasks = []
    async with aiohttp.ClientSession() as session:
        for batch_start in range(0, len(rows), batch_size):
            batch = [r for r in rows[batch_start:batch_start + batch_size] if r.get("parent_sku") not in existing_skus]
            if batch:
                tasks.append(throttled_label_batch(session, batch, batch_start))
        await asyncio.gather(*tasks)

    conn.close()
    failed_log.close()
    print("✅ All rows processed.", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
