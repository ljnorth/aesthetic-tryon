// File: src/app/api/create-moodboard/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function OPTIONS() {
  // Respond to preflight CORS request
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // or you can put your specific domain here
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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

    const textPrompt = 
      'Create a high-fashion editorial moodboard with these items on a clean white background: ' +
      images.join('; ');

    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: textPrompt,
      size: '1024x1024',
      quality: 'high',
      n: 1,
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error('OpenAI did not return an image URL.');
    }

    const res = NextResponse.json({ image_url: imageUrl });
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return res;
  } catch (err: any) {
    console.error('Error in create-moodboard route:', err);
    const res = NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return res;
  }
}
