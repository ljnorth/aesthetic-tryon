'use client';

import React, { useEffect, useState } from 'react';
import { loadCatalogFromSupabase, Product } from '@/utils/loadCatalogFromSupabase';

const categories = ['outerwear', 'top', 'bottoms', 'shoes', 'accessory'];

export default function OutfitBuilder() {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, Product[]>>({});
  const [loading, setLoading] = useState(false);
  const [moodboard, setMoodboard] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCatalog() {
      try {
        const catalog = await loadCatalogFromSupabase();
        console.log('🧾 Products loaded:', catalog);
        setCatalog(catalog);
      } catch (err) {
        console.error('Failed to load catalog:', err);
      }
    }
    fetchCatalog();
  }, []);

  const toggleSelect = (category: string, product: Product) => {
    setSelectedProducts((prev) => {
      const existing = prev[category] || [];
      const exists = existing.find((p) => p.id === product.id);

      let updated;
      if (exists) {
        updated = existing.filter((p) => p.id !== product.id);
      } else {
        updated = [...existing, product].slice(0, category === 'accessory' ? 3 : 1);
      }

      return { ...prev, [category]: updated };
    });
  };

  return (
    <div className="p-4 space-y-8">
      <h1 className="text-3xl font-bold mb-6">Build Your Outfit</h1>

      {categories.map((category) => (
        <div key={category}>
          <h2 className="text-lg font-semibold capitalize mb-4">{category}</h2>
          <div className="flex overflow-x-auto space-x-4 py-2">
            {catalog
              .filter((item) => item.category?.toLowerCase() === category)
              .map((item) => (
                <button
                  key={item.id}
                  className={`flex-none w-28 h-28 border rounded-md overflow-hidden ${
                    selectedProducts[category]?.find((p) => p.id === item.id)
                      ? 'border-blue-500'
                      : 'border-gray-300'
                  }`}
                  onClick={() => toggleSelect(category, item)}
                >
                  <img
                    src={item.image_url}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
          </div>
        </div>
      ))}

      {Object.values(selectedProducts).flat().length > 0 && (
        <div className="pt-6">
          <button
            onClick={() => console.log('Generate moodboard with:', selectedProducts)}
            className="bg-black text-white px-6 py-3 rounded-lg text-lg font-semibold"
            disabled={loading}
          >
            {loading ? 'Generating Moodboard...' : 'Create Moodboard'}
          </button>
        </div>
      )}

      {moodboard && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-2">Your Moodboard</h2>
          <img src={moodboard} alt="Moodboard" className="mt-2 border shadow-lg max-w-full rounded-md" />
        </div>
      )}
    </div>
  );
}
