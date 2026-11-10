"use client";

import "./globals.css";

/** Last resort, when even the main layout failed: plain HTML, still in Feasto's words. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-[#fdf7f2] px-4 font-sans">
        <main className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-ink">Feasto didn&apos;t load</h1>
          <p className="mt-2 text-muted">Something went wrong on our side. Nothing you did was lost. Try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
