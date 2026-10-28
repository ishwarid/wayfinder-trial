import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Wayfinder: ask any codebase how it works", template: "%s | Wayfinder" },
  description:
    "Paste a GitHub repository and ask how it works. An AI agent reads the code with read-only tools and cites the exact lines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
