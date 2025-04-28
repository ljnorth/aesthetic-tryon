// scripts/parseAndUpdateCatalog.ts

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function normalizeProduct(item: { type: string; color: string; style: string; }) {
  const systemPrompt = `
You are a fashion AI assistant. Given a product's type, color, and style,
return the following standardized fields:
- primary_category (one of: Clothing, Shoes, Bags, Accessories)
- sub_category (examples: Jeans, Boots, Backpacks, Hats, etc.)
- primary_color (normalize into black, white, blue, pink, green, red, gray, yellow, brown, orange, purple, multicolor, or other)
Only respond with a compact JSON object like:
{"primary_category":"Clothing", "sub_category":"Jeans", "primary_color":"blue"}
`;

  const userContent = `Item type: ${item.type}\nColor: ${item.color}\nStyle: ${item.style}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
  });

  const message = response.choices?.[0]?.message?.content;
  console.log('🧠 AI raw output:', message);

  try {
    const parsed = JSON.parse(message || '{}');
    return {
      primary_category: parsed.primary_category || null,
      sub_category: parsed.sub_category || null,
      primary_color: parsed.primary_color || null,
    };
  } catch (err) {
    console.error('❌ Failed to parse AI response:', message);
    return null;
  }
}

async function processCatalogBatch() {
  const { data: products, error } = await supabase
    .from('product_catalog')
    .select('id, items_detected')
    .limit(1000);

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  console.log(`🎯 Fetched ${products.length} products.`);

  for (const product of products || []) {
    try {
      const itemsDetected = product.items_detected;

      // items_detected is stored as a single object, not an array
      if (!itemsDetected || typeof itemsDetected !== 'object') {
        console.warn(`⚠️ No items_detected for product ${product.id}`);
        continue;
      }

      const mainItem = itemsDetected;
      const type = mainItem.type || '';
      const color = mainItem.color || '';
      const style = mainItem.style || '';

      if (!type) {
        console.warn(`⚠️ No type found for product ${product.id}`);
        continue;
      }

      const normalized = await normalizeProduct({ type, color, style });

      if (!normalized) {
        console.warn(`⚠️ AI normalization failed for product ${product.id}`);
        continue;
      }

      const { data: updateData, error: updateError } = await supabase
        .from('product_catalog')
        .update({
          primary_category: normalized.primary_category,
          sub_category: normalized.sub_category,
          primary_color: normalized.primary_color,
          color_variant: color || null,
          primary_style: style || null,
        })
        .eq('id', product.id)
        .select();

      if (updateError) {
        console.error(`❌ Failed to update product ${product.id}:`, updateError);
      } else {
        console.log(`✅ Successfully updated product ${product.id}`);
      }

    } catch (err) {
      console.error('❌ Error processing product:', product.id, err);
    }
  }

  console.log('🎯 Catalog parsing + normalization completed.');
}

processCatalogBatch();
