// src/pages/index.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/OutfitBuilder'); // or /SwipeView if that’s your preferred entrypoint
  }, []);
  return null;
}
