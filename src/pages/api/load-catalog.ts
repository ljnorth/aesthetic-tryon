// src/pages/api/load-catalog.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Papa from 'papaparse';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const catalogRes = await fetch('https://storage.googleapis.com/product_catalog_my_ae/product_catalog.csv');
    const text = await catalogRes.text();
    const { data } = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Catalog fetch failed:', error);
    res.status(500).json({ error: 'Failed to load catalog' });
  }
}
