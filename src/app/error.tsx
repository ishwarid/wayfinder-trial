"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-ink-soft mt-3">
        The repository couldn&apos;t be shown. This is usually temporary.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-route text-on-route rounded-lg px-4 py-2 font-semibold"
        >
          Try again
        </button>
        <Link href="/" className="border-line rounded-lg border px-4 py-2 font-medium">
          Go to the start
        </Link>
      </div>
    </main>
  );
}
