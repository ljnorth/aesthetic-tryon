// src/app/api/create-moodboard/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { randomUUID } from 'crypto';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    // Parse body
    const { products }: { products: { id: string; category: string }[] } = await request.json();

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No products provided.' }, { status: 400 });
    }

    // Fetch product images from Supabase
    const ids = products.map((p) => p.id);
    const { data: records, error: fetchError } = await supabase
      .from('product_catalog')
      .select('id, image_url')
      .in('id', ids);

    if (fetchError) {
      throw new Error(`Supabase fetch error: ${fetchError.message}`);
    }

    const idToUrl: Record<string, string> = {};
    (records || []).forEach((rec) => {
      if (rec.id && rec.image_url) idToUrl[rec.id] = rec.image_url;
    });

    const images = products
      .map((p) => idToUrl[p.id])
      .filter((url): url is string => Boolean(url));

    if (images.length === 0) {
      return NextResponse.json({ error: 'No valid images found.' }, { status: 400 });
    }

    // Build prompt
    const textPrompt =
      'Create a high-fashion editorial moodboard using these product image URLs on a clean white background: ' +
      images.join('; ');

    // Generate moodboard with OpenAI
    const aiResponse = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: textPrompt,
      size: '1024x1024',
      response_format: 'b64_json', // << important!
      quality: 'high',
    });

    const b64Image = aiResponse.data?.[0]?.b64_json;
    if (!b64Image) {
      throw new Error('OpenAI did not return a base64 image.');
    }

    // Upload to Supabase Storage
    const buffer = Buffer.from(b64Image, 'base64');
    const fileName = `${randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
      .from('moodboards')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Supabase upload error: ${uploadError.message}`);
    }

    const publicUrl = `${process.env.SUPABASE_URL!.replace(
      '.supabase.co',
      '.supabase.co/storage/v1/object/public'
    )}/moodboards/${fileName}`;

    // Return public URL
    return NextResponse.json({ image_url: publicUrl });
  } catch (err: any) {
    console.error('Error in create-moodboard route:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
