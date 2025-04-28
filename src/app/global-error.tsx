'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-24">
          <h2 className="text-2xl font-bold">Something went wrong!</h2>
          <p className="mt-4">{error.message}</p>
          <button
            onClick={reset}
            className="mt-4 rounded bg-black px-4 py-2 text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
} 