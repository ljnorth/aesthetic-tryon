// utils/loadCatalogFromSupabase.ts

import { createClient, PostgrestError } from '@supabase/supabase-js';

// initialize your client (using the public anon key for frontend reads)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface Product {
  id:             string;
  title:          string;
  image_url:      string;
  primary_category: string | null;
  sub_category:     string | null;
  primary_color:   string | null;
  color_variant:   string | null;
  primary_style:   string | null;
}

/**
 * Fetch the product catalog, including your new normalized fields.
 */
export async function loadCatalogFromSupabase(): Promise<Product[]> {
  // NOTE: we do *not* put <Product> on .from(), because v2 expects
  // the generic on `from()` to be one of your table names, not a TS type.
  const { data, error }: { data: Product[] | null; error: PostgrestError | null } =
    await supabase
      .from('product_catalog')
      .select(
        [
          'id',
          'title',
          'image_url',
          'primary_category',
          'sub_category',
          'primary_color',
          'color_variant',
          'primary_style',
        ].join(', ')
      );

  if (error) {
    console.error('❌ Error loading catalog:', error);
    throw error;
  }

  // data is Product[] | null
  return data ?? [];
}
