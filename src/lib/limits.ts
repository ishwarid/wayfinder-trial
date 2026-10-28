/*
 * In-memory fixed-window limits that protect the free model quota. Each
 * serverless instance keeps its own counts, so the effective limit is
 * (instances × limit). For production, put the same interface over Redis.
 */

export type LimitResult = { ok: true; remaining: number } | { ok: false; resetAt: Date };
export interface Limiter {
  take(key: string, now?: Date): LimitResult;
}

export function createFixedWindowLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): Limiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key, now = new Date()) {
      const time = now.getTime();
      let window = windows.get(key);
      if (!window || time - window.start >= windowMs) {
        if (!window && windows.size >= maxKeys) windows.delete(windows.keys().next().value!);
        window = { start: time, count: 0 };
        windows.set(key, window);
      }
      if (window.count >= limit) return { ok: false, resetAt: new Date(window.start + windowMs) };
      window.count++;
      return { ok: true, remaining: limit - window.count };
    },
  };
}

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const dailyLimiter = createFixedWindowLimiter({
  limit: envInt("DAILY_MESSAGE_LIMIT", 40),
  windowMs: 24 * 60 * 60 * 1000,
});

export const globalLimiter = createFixedWindowLimiter({
  limit: envInt("GLOBAL_MESSAGES_PER_MINUTE", 20),
  windowMs: 60 * 1000,
});
