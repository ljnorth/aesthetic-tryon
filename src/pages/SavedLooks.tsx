'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SavedLook {
  id: string;
  created_at: string;
  media_url: string;
  user_id: string;
}

export default function SavedLooks() {
  const [looks, setLooks] = useState<SavedLook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLooks = async () => {
      const { data, error } = await supabase
        .from('saved_looks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching saved looks:', error);
      } else {
        setLooks(data || []);
      }

      setLoading(false);
    };

    fetchLooks();
  }, []);

  return (
    <div className="min-h-screen p-6 bg-white">
      <h1 className="text-2xl font-semibold mb-4">Your Saved Looks</h1>
      {loading ? (
        <p>Loading...</p>
      ) : looks.length === 0 ? (
        <p>No looks saved yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {looks.map((look) => (
            <div key={look.id} className="relative border rounded shadow overflow-hidden">
              <img
                src={look.media_url}
                alt="Saved look"
                loading="lazy"
                className="w-full h-80 object-cover"
              />
              <div className="p-2 text-sm text-gray-600">
                Saved: {new Date(look.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
