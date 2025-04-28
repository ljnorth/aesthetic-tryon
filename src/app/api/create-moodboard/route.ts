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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Handle CORS preflight request
export async function OPTIONS() {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // safer later to lock this down
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Handle actual POST request
export async function POST(request: Request) {
  try {
    const { products }: { products: { id: string; category: string }[] } = await request.json();

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No products provided.' }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Fetch product images from Supabase
    const ids = products.map((p) => p.id);
    const { data: records, error: fetchError } = await supabase
      .from('product_catalog')
      .select('id, hosted_image_url')
      .in('id', ids);

    if (fetchError) {
      throw new Error(`Supabase error: ${fetchError.message}`);
    }

    const idToUrl: Record<string, string> = {};
    (records || []).forEach((rec) => {
      if (rec.id && rec.hosted_image_url) idToUrl[rec.id] = rec.hosted_image_url;
    });

    const images = products
      .map((p) => idToUrl[p.id])
      .filter((url): url is string => Boolean(url));

    if (images.length === 0) {
      return NextResponse.json({ error: 'No valid images found for provided product IDs.' }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Build the prompt
    const textPrompt = `Create a high-end fashion editorial moodboard with the following items shown cleanly on a white background: ${images.join('; ')}`;

    // Call OpenAI (gpt-image-1 model)
    const openaiResponse = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: textPrompt,
      size: '1024x1024',
      quality: 'high',
      response_format: 'url',
      n: 1,
    });

    const imageUrl = openaiResponse.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error('OpenAI did not return a valid image URL.');
    }

    return NextResponse.json({ image_url: imageUrl }, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (err: any) {
    console.error('Error in create-moodboard route:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
}
