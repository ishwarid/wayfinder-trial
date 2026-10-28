import { findTodos } from "./todos";
import type { Snapshot } from "./types";

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  cpp: "C++",
  cc: "C++",
  c: "C",
  h: "C",
  scala: "Scala",
  dart: "Dart",
  vue: "Vue",
  svelte: "Svelte",
  css: "CSS",
  scss: "CSS",
  html: "HTML",
  sql: "SQL",
  sh: "Shell",
};

const FRAMEWORKS: Array<[RegExp, string]> = [
  [/"next"\s*:/, "Next.js"],
  [/"react"\s*:/, "React"],
  [/"vue"\s*:/, "Vue"],
  [/"svelte"\s*:/, "Svelte"],
  [/"@angular\/core"\s*:/, "Angular"],
  [/"express"\s*:/, "Express"],
  [/"fastify"\s*:/, "Fastify"],
  [/"@nestjs\/core"\s*:/, "NestJS"],
  [/"prisma"\s*:|"@prisma\/client"\s*:/, "Prisma"],
  [/"drizzle-orm"\s*:/, "Drizzle"],
  [/\bdjango\b/i, "Django"],
  [/\bflask\b/i, "Flask"],
  [/\bfastapi\b/i, "FastAPI"],
  [/\bgin-gonic\/gin\b/, "Gin"],
  [/\bspring-boot\b/, "Spring Boot"],
];

const MANIFESTS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "composer.json",
  "Gemfile",
];

const ENTRY_POINTS = [
  /^(src\/)?(index|main|server|app)\.(t|j)sx?$/,
  /^(src\/)?app\/(page|layout)\.(t|j)sx?$/,
  /^(src\/)?pages\/(index|_app)\.(t|j)sx?$/,
  /^(main|app|manage|wsgi|asgi)\.py$/,
  /^cmd\/[^/]+\/main\.go$/,
  /^main\.go$/,
  /^src\/main\.rs$/,
];

export type Overview = ReturnType<typeof buildOverview>;

/** A first look at a repository, built without AI. */
export function buildOverview(snapshot: Snapshot) {
  const languages = new Map<string, { files: number; lines: number }>();
  let totalLines = 0;
  const topLevel = new Map<string, number>();

  for (const [path, content] of snapshot.files) {
    const lines = content.split("\n").length;
    totalLines += lines;

    const ext = path.split(".").pop()!.toLowerCase();
    const language = LANGUAGES[ext];
    if (language) {
      const entry = languages.get(language) ?? { files: 0, lines: 0 };
      entry.files++;
      entry.lines += lines;
      languages.set(language, entry);
    }

    const [first, ...rest] = path.split("/");
    const key = rest.length ? `${first}/` : first!;
    topLevel.set(key, (topLevel.get(key) ?? 0) + 1);
  }

  const readmePath = [...snapshot.files.keys()].find((p) => /^readme(\.\w+)?$/i.test(p));
  const readmeLines = readmePath ? snapshot.files.get(readmePath)!.split("\n").slice(0, 60) : [];

  const manifests = MANIFESTS.filter((name) => snapshot.files.has(name));
  const manifestText = manifests.map((m) => snapshot.files.get(m)!).join("\n");
  const frameworks = FRAMEWORKS.filter(([pattern]) => pattern.test(manifestText)).map(([, n]) => n);

  return {
    name: `${snapshot.owner}/${snapshot.repo}`,
    description: snapshot.description,
    commit: snapshot.sha.slice(0, 7),
    fileCount: snapshot.files.size,
    totalLines,
    languages: [...languages.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 8),
    frameworks,
    entryPoints: [...snapshot.files.keys()].filter((p) => ENTRY_POINTS.some((re) => re.test(p))),
    topLevel: [...topLevel.entries()].map(([path, files]) => ({ path, files })),
    manifests,
    readme: readmePath
      ? {
          path: readmePath,
          startLine: 1,
          endLine: readmeLines.length,
          content: readmeLines.join("\n").slice(0, 3_000),
        }
      : null,
    todoCount: findTodos(snapshot).length,
    skippedFiles: snapshot.skipped.total,
    redactedSecrets: snapshot.redactions,
  };
}
