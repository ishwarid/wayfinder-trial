/*
 * Best-effort secret redaction, applied to every file before it's stored.
 *
 * This is a second line of defence: users can only load repositories they
 * can already read. But a private repo can still contain keys, and they
 * shouldn't be sent to a third-party model or shown in a chat transcript.
 * Every replacement keeps the line structure, so line numbers in citations
 * stay correct.
 */

export const REDACTED = "[redacted]";

const TOKEN_PATTERNS: RegExp[] = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS access key IDs
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g, // GitHub fine-grained tokens
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, // OpenAI / Anthropic style keys
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g, // Stripe keys
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
];

// `apiKey = "..."`, `"client_secret": "..."`, `PASSWORD: '...'` and similar.
const ASSIGNMENT =
  /((?:api[_-]?key|secret|passw(?:or)?d|token|credential|private[_-]?key|access[_-]?key)[A-Za-z0-9_-]*["']?\s*[:=]\s*)(["'`])([^"'`\s]{8,})\2/gi;

// scheme://user:password@host
const URL_PASSWORD = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]{3,})(@)/gi;

const KEY_BLOCK_START = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const KEY_BLOCK_END = /-----END [A-Z ]*PRIVATE KEY-----/;

export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  let inKeyBlock = false;

  const lines = text.split("\n").map((line) => {
    if (inKeyBlock) {
      if (KEY_BLOCK_END.test(line)) inKeyBlock = false;
      return line.trim() ? REDACTED : line;
    }
    if (KEY_BLOCK_START.test(line)) {
      inKeyBlock = !KEY_BLOCK_END.test(line);
      count++;
      return REDACTED;
    }

    let out = line;
    for (const pattern of TOKEN_PATTERNS) {
      out = out.replace(pattern, () => {
        count++;
        return REDACTED;
      });
    }
    out = out.replace(ASSIGNMENT, (match, prefix: string, quote: string, value: string) => {
      if (value === REDACTED) return match;
      count++;
      return `${prefix}${quote}${REDACTED}${quote}`;
    });
    out = out.replace(URL_PASSWORD, (_m, before: string, _pw: string, at: string) => {
      count++;
      return `${before}${REDACTED}${at}`;
    });
    return out;
  });

  return { text: lines.join("\n"), count };
}
