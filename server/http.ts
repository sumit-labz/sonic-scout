export type ProviderErrorKind = "rate_limited" | "auth" | "upstream" | "timeout";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryAfterSec: number | null = null,
  ) {
    super(message);
  }
}

export interface FetchOptions {
  userAgent: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  label: string;
}

const TIMEOUT_MS = 12_000;
const MAX_INLINE_WAIT_SEC = 2;

export function retryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, (date - Date.now()) / 1000);
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export async function fetchJson<T>(url: string, options: FetchOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": options.userAgent, Accept: "application/json", ...options.headers },
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      if (attempt === 0 && !timedOut) continue;
      throw new ProviderError(
        timedOut ? "timeout" : "upstream",
        timedOut ? `${options.label} took too long to respond.` : `Could not reach ${options.label}.`,
      );
    }

    if (response.ok) return (await response.json()) as T;

    if (response.status === 429) {
      const after = retryAfter(response);
      if (attempt === 0 && after !== null && after <= MAX_INLINE_WAIT_SEC) {
        await wait(after);
        continue;
      }
      throw new ProviderError("rate_limited", `${options.label} rate limit reached.`, after ?? 60);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("auth", `${options.label} rejected the request (${response.status}).`);
    }
    if (response.status >= 500 && attempt === 0) {
      await wait(0.4);
      continue;
    }
    throw new ProviderError("upstream", `${options.label} returned ${response.status}.`);
  }
}

export class TtlCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]!);
      }
    }),
  );
  return results;
}

export function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const LOSSLESS_FORMATS = new Set(["wav", "wave", "aif", "aiff", "flac"]);

export function formatFromName(name: string | null | undefined): string | null {
  return name?.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1]?.toLowerCase() ?? null;
}
