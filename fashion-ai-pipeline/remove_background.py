# background_removal.py

import os
import requests
import cv2
import torch
import numpy as np
import supervision as sv
from PIL import Image
from io import BytesIO
from dotenv import load_dotenv
from ultralytics import YOLO
import psycopg2
import json
from torchvision.models.segmentation import deeplabv3_resnet101
from torchvision import transforms
from torchvision.transforms.functional import to_pil_image
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
SUPABASE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET")

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

# === Setup YOLO for person detection ===
yolo_model = YOLO("yolov8n.pt")

# === Setup DeepLabV3 model for background removal ===
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = deeplabv3_resnet101(pretrained=True).to(device).eval()

# === Define helper to detect people in image ===
def detect_person_in_image(image_bytes):
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        results = yolo_model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(results)
        person_labels = detections.class_id == 0
        return person_labels.any()
    except Exception as e:
        print(f"❌ Error checking image: {e}")
        return False

# === Select valid product image ===
def get_best_image_for_bg_removal(primary_image, additional_images):
    image_sources = []
    if primary_image:
        image_sources.append(("primary", primary_image))
    image_sources += [("additional", url) for url in additional_images]

    for source, url in image_sources:
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            has_person = detect_person_in_image(response.content)
            if not has_person:
                return url
        except Exception as e:
            print(f"⚠️ Failed to fetch or process {url}: {e}")
    return None

# === Background removal using DeepLabV3 ===
def remove_background(image_bytes):
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        transform = transforms.Compose([
            transforms.Resize(520),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
        ])
        input_tensor = transform(image).unsqueeze(0).to(device)

        with torch.no_grad():
            output = model(input_tensor)['out'][0]
        output_predictions = output.argmax(0).byte().cpu().numpy()

        mask = (output_predictions != 0).astype(np.uint8) * 255
        mask = cv2.resize(mask, image.size)

        image_np = np.array(image)
        image_rgba = np.dstack((image_np, mask))
        result_image = Image.fromarray(image_rgba)

        output = BytesIO()
        result_image.save(output, format="PNG")
        output.seek(0)
        return output.read()

    except Exception as e:
        print(f"❌ Background removal failed: {e}")
        return image_bytes

# === Process rows in batches ===
def process_images_from_supabase(batch_size=50):
    offset = 0
    while True:
        cursor.execute('SELECT id, parent_sku, additional_images, hosted_image_url FROM product_catalog OFFSET %s LIMIT %s', (offset, batch_size))
        rows = cursor.fetchall()
        if not rows:
            break

        for row in rows:
            product_id, parent_sku, additional_images_json, primary_image = row

            try:
                additional_images = json.loads(additional_images_json or "[]")
                selected_url = get_best_image_for_bg_removal(primary_image, additional_images)

                if selected_url:
                    print(f"✅ [{parent_sku}] Selected for background removal: {selected_url}")
                    img_response = requests.get(selected_url)
                    processed_img = remove_background(img_response.content)

                    # Upload to Supabase Storage
                    file_path = f"transparent/{parent_sku}.png"
                    supabase.storage.from_(SUPABASE_BUCKET).upload(
                        path=file_path,
                        file=processed_img,
                        file_options={"content-type": "image/png"},
                        upsert=True
                    )

                    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{file_path}"

                    # Write transparent image URL back to product_catalog
                    cursor.execute(
                        """
                        UPDATE product_catalog
                        SET transparent_image_url = %s
                        WHERE id = %s
                        """,
                        (public_url, product_id)
                    )
                    conn.commit()
                    print(f"🖼️  Uploaded transparent: {public_url}")
                else:
                    print(f"🚫 [{parent_sku}] No suitable image found for background removal.")
            except Exception as e:
                print(f"❌ [{parent_sku}] Error: {e}")

        offset += batch_size

    conn.close()

if __name__ == "__main__":
    process_images_from_supabase(batch_size=50)
