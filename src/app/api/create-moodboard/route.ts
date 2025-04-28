// src/app/api/create-moodboard/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// CORS handler
export async function OPTIONS() {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // Or specify your Lovable domain for stricter security
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: Request) {
  try {
    const { products }: { products: { id: string; category: string }[] } = await request.json();

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No products provided.' }, { status: 400 });
    }

    const ids = products.map((p) => p.id);

    const { data: records, error: fetchError } = await supabase
      .from('product_catalog')
      .select('id, image_url')
      .in('id', ids);

    if (fetchError) {
      throw new Error(`Supabase error: ${fetchError.message}`);
    }

    const idToUrl: Record<string, string> = {};
    (records || []).forEach((rec) => {
      if (rec.id && rec.image_url) idToUrl[rec.id] = rec.image_url;
    });

    const images = products
      .map((p) => idToUrl[p.id])
      .filter((url): url is string => Boolean(url));

    if (images.length === 0) {
      return NextResponse.json({ error: 'No valid images found for provided product IDs.' }, { status: 400 });
    }

    const textPrompt = `Create a high-fashion editorial moodboard using these product image URLs on a clean white background: ${images.join('; ')}`;

    const response = await openai.images.generate({
      model: 'image-alpha-001', // or 'dall-e-3' or whatever your OpenAI model actually is
      prompt: textPrompt,
      size: '1024x1024',
      n: 1,
      response_format: 'b64_json',
    });

    const base64Image = response.data?.[0]?.b64_json;
    if (!base64Image) {
      throw new Error('OpenAI did not return base64 image.');
    }

    // Upload to Supabase Storage
    const buffer = Buffer.from(base64Image, 'base64');
    const fileName = `moodboards/${Date.now()}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('moodboards')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        cacheControl: '3600',
      });

    if (uploadError) {
      throw new Error(`Failed to upload moodboard to Supabase: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage.from('moodboards').getPublicUrl(fileName);

    if (!publicUrlData?.publicUrl) {
      throw new Error('Failed to generate public URL.');
    }

    return NextResponse.json({ image_url: publicUrlData.publicUrl }, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Again, lock this down to your real frontend later
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (err: any) {
    console.error('Error in create-moodboard route:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
}
