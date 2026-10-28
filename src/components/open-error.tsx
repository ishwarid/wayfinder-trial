import Link from "next/link";

export function OpenErrorView({
  title,
  message,
  signInUrl,
  installUrl,
}: {
  title: string;
  message: string;
  signInUrl: string | null;
  installUrl: string | null;
}) {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-ink-soft mt-3 leading-relaxed">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {signInUrl && (
          <a href={signInUrl} className="bg-route text-on-route rounded-lg px-4 py-2 font-semibold">
            Sign in with GitHub
          </a>
        )}
        {installUrl && (
          <a
            href={installUrl}
            className="bg-route text-on-route rounded-lg px-4 py-2 font-semibold"
          >
            Choose repositories on GitHub
          </a>
        )}
        <Link href="/" className="border-line rounded-lg border px-4 py-2 font-medium">
          Try another repository
        </Link>
      </div>
    </main>
  );
}
