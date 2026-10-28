import type { NextConfig } from "next";

// The built-in sample repository is read from disk at runtime. Vercel only
// ships files it can trace, so list the folder for every route that reads it.
const sample = ["./evals/fixtures/tiny-shop/**/*"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/chat": sample,
    "/r/[owner]/[repo]": sample,
    "/r/[owner]/[repo]/view": sample,
  },
  images: { remotePatterns: [{ hostname: "avatars.githubusercontent.com" }] },
};

export default nextConfig;
