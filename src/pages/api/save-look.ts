// src/pages/api/save-look.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role key to allow insert
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, media_url } = req.body;

  if (!user_id || !media_url) {
    return res.status(400).json({ error: 'Missing user_id or media_url' });
  }

  const { data, error } = await supabase.from('saved_looks').insert([{ user_id, media_url }]).select();

  if (error) {
    console.error('❌ Supabase insert error:', error);
    return res.status(500).json({ error: 'Failed to save look' });
  }

  return res.status(200).json({ success: true, saved: data });
}
