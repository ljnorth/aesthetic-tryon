// File: src/app/api/create-moodboard/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

// Initialize Supabase with the service role key for secure server-side access
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    // Parse the incoming JSON body
    const { products }: { products: { id: string; category: string }[] } = await request.json();

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No products provided.' }, { status: 400 });
    }

    // Fetch the image URLs for the selected products from Supabase
    const ids = products.map((p) => p.id);
    const { data: records, error: fetchError } = await supabase
      .from('product_catalog')
      .select('id, image_url')
      .in('id', ids);

    if (fetchError) {
      throw new Error(`Supabase error: ${fetchError.message}`);
    }

    // Map each id to its image_url
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

    // Build prompt including public image URLs
    const textPrompt =
      'Create a high-fashion editorial moodboard using these product image URLs on a clean white background: ' +
      images.map((url) => url).join('; ');

    // Call OpenAI's Image Generation endpoint (DALL·E)
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: textPrompt,
      size: '1024x1024',
      n: 1,
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error('OpenAI did not return an image URL.');
    }

    // Return the generated moodboard URL
    return NextResponse.json({ image_url: imageUrl });
  } catch (err: any) {
    console.error('Error in create-moodboard route:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}
