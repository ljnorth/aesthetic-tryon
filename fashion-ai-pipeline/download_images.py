import os
import asyncio
import aiohttp
from dotenv import load_dotenv
from supabase import create_client, Client

# === Load ENV ===
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_NAME = os.getenv("SUPABASE_STORAGE_BUCKET")
BATCH_SIZE = 50

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# === Fetch a batch of rows ===
async def fetch_batch(offset):
    response = supabase.table("product_catalog") \
        .select("id, parent_sku, image_url, hosted_image_url") \
        .range(offset, offset + BATCH_SIZE - 1) \
        .execute()
    return response.data or []

# === Process one product ===
async def process_product(session, product):
    parent_sku = product.get("parent_sku")
    image_url = product.get("image_url")
    hosted_image_url = product.get("hosted_image_url")
    row_id = product.get("id")

    if not parent_sku or not image_url or not row_id:
        print(f"⚠️  Skipping row due to missing fields")
        return

    if hosted_image_url:
        print(f"⏩ Already uploaded: {parent_sku}")
        return

    try:
        async with session.get(image_url, timeout=10) as resp:
            if resp.status != 200:
                raise Exception(f"HTTP {resp.status}")
            content = await resp.read()

        # Extract file extension safely
        extension = image_url.split("?")[0].split(".")[-1].split("/")[-1]
        file_path = f"originals/{parent_sku}.{extension}"

        # Upload to Supabase Storage
        supabase.storage.from_(BUCKET_NAME).upload(
            path=file_path,
            file=content,
            file_options={"content-type": f"image/{extension}"}
        )

        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{file_path}"

        # Update Supabase row
        supabase.table("product_catalog").update({
            "hosted_image_url": public_url
        }).eq("id", row_id).execute()

        print(f"✅ Uploaded {parent_sku}: {public_url}")

    except Exception as e:
        print(f"❌ Failed {parent_sku}: {e}")

# === Main runner ===
async def main():
    offset = 0
    while True:
        batch = await fetch_batch(offset)
        if not batch:
            break

        print(f"\n🚚 Processing batch {offset} → {offset + BATCH_SIZE - 1}")
        async with aiohttp.ClientSession() as session:
            tasks = [process_product(session, product) for product in batch]
            await asyncio.gather(*tasks)

        offset += BATCH_SIZE

if __name__ == "__main__":
    asyncio.run(main())
