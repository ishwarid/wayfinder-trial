import Link from "next/link";
import type { Session } from "@/lib/session";

export function SiteHeader({
  session,
  authConfigured,
  returnTo = "/",
  wide = false,
}: {
  session: Session | null;
  authConfigured: boolean;
  returnTo?: string;
  /** Full width, to line up with the workspace sidebar. */
  wide?: boolean;
}) {
  return (
    <header className="border-line bg-surface border-b">
      <div
        className={`flex items-center justify-between gap-4 px-4 py-3 sm:px-6 ${wide ? "" : "mx-auto max-w-6xl"}`}
      >
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <WayfinderMark />
          Wayfinder
        </Link>

        {session ? (
          <div className="flex items-center gap-3 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny avatar from GitHub's CDN */}
            <img src={session.avatarUrl} alt="" width={24} height={24} className="rounded-full" />
            <span className="text-ink-soft hidden sm:inline">{session.login}</span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="text-ink-soft hover:text-ink underline-offset-4 hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : authConfigured ? (
          <a
            href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="border-line hover:bg-sunken rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            Sign in with GitHub
          </a>
        ) : null}
      </div>
    </header>
  );
}

export function WayfinderMark({ size = 22 }: { size?: number }) {
  // A route between two waypoints.
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M5 17c0-5 12-3 12-10"
        fill="none"
        stroke="var(--route)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="0.1 3.6"
      />
      <circle cx="5" cy="17" r="2.6" fill="var(--route)" />
      <circle cx="17" cy="5" r="2.6" fill="none" stroke="var(--route)" strokeWidth="2" />
    </svg>
  );
}
