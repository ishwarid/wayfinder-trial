"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { repoPath } from "@/lib/links";
import { parseRepoInput } from "@/lib/repo/parse";

export function RepoInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  return (
    <form
      className="w-full max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        const ref = parseRepoInput(value);
        if (!ref) {
          setError(
            "Enter owner/repo or a GitHub URL, for example vercel/ai or https://github.com/vercel/ai.",
          );
          return;
        }
        setError(null);
        const query = ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : "";
        router.push(`${repoPath(ref)}${query}`);
      }}
    >
      <label htmlFor={id} className="text-ink-soft mb-2 block text-sm">
        GitHub repository
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="owner/repo or https://github.com/owner/repo"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="border-line bg-surface focus:border-route h-12 flex-1 rounded-lg border px-4 font-mono text-[15px] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--route)_25%,transparent)] focus-visible:outline-none"
        />
        <button
          type="submit"
          className="bg-route text-on-route hover:bg-route-strong h-12 rounded-lg px-6 font-semibold"
        >
          Explore
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-danger mt-2 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
