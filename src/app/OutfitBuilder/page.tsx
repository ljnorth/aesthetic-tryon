'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { loadCatalogFromSupabase, Product } from '@/utils/loadCatalogFromSupabase';
import { Dialog, DialogContent } from '@/components/ui/dialog'; // from shadcn/ui
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CheckCircle } from 'lucide-react';

const CATEGORIES = [
  { key: 'outerwear', label: 'Outerwear' },
  { key: 'top',       label: 'Tops' },
  { key: 'bottoms',   label: 'Bottoms' },
  { key: 'shoes',     label: 'Shoes' },
  { key: 'accessory', label: 'Accessories' },
];

export default function OutfitBuilder() {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [generating, setGenerating] = useState(false);
  const [moodboardUrl, setMoodboardUrl] = useState<string | null>(null);

  useEffect(() => {
    loadCatalogFromSupabase()
      .then(data => setCatalog(data))
      .catch(console.error)
      .finally(() => setLoadingCatalog(false));
  }, []);

  const toggle = (category: string, id: string) => {
    setSelected(prev => {
      const next = { ...prev };
      const setForCat = new Set(prev[category] || []);
      if (setForCat.has(id)) setForCat.delete(id);
      else setForCat.add(id);
      next[category] = setForCat;
      return next;
    });
  };

  const totalSelected = Object.values(selected).reduce((sum, s) => sum + s.size, 0);

  const createMoodboard = async () => {
    setGenerating(true);
    try {
      const products = CATEGORIES.flatMap(cat =>
        Array.from(selected[cat.key] || []).map(id => ({ id, category: cat.key }))
      );
      const res = await fetch('/api/create-moodboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });
      const { image_url } = await res.json();
      setMoodboardUrl(image_url);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <h1 className="text-4xl font-bold px-6 pt-6">Build Your Outfit</h1>

      {CATEGORIES.map(({ key, label }) => {
        const items = catalog.filter(p => p.primary_category === key);
        return (
          <section key={key} className="mt-8">
            <h2 className="text-2xl font-semibold px-6 mb-2">{label}</h2>

            {loadingCatalog ? (
              <div className="px-6 animate-pulse flex space-x-4 overflow-x-auto">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-32 h-40 bg-gray-200 rounded" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="px-6 text-gray-500">No items in this category.</p>
            ) : (
              <div className="px-6 flex space-x-4 overflow-x-auto">
                {items.map(item => {
                  const isSel = selected[key]?.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggle(key, item.id)}
                      className={`relative flex-none w-32 h-40 border-2 ${
                        isSel ? 'border-blue-500' : 'border-gray-200'
                      } rounded overflow-hidden cursor-pointer transition`}
                    >
                      <Image
                        src={item.image_url}
                        alt={item.title}
                        width={128}
                        height={160}
                        className="object-cover w-full h-full"
                      />
                      {isSel && (
                        <CheckCircle className="absolute top-1 right-1 text-blue-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* Generate Bar */}
      {totalSelected > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex items-center justify-between shadow-lg">
          <span>{totalSelected} item{totalSelected>1?'s':''} selected</span>
          <Button
            onClick={createMoodboard}
            disabled={generating}
            className="px-6 py-2"
          >
            {generating ? <Spinner /> : 'Generate Moodboard'}
          </Button>
        </div>
      )}

      {/* Moodboard Modal */}
      {moodboardUrl && (
        <Dialog open onOpenChange={() => setMoodboardUrl(null)}>
          <DialogContent className="max-w-3xl p-0 bg-transparent shadow-none">
            <Image
              src={moodboardUrl}
              alt="Your Moodboard"
              width={800}
              height={800}
              className="rounded"
            />
            <div className="text-center mt-4">
              <Button asChild><a href={moodboardUrl} download>Download</a></Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
