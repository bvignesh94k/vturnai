/**
 * Guarded HTTP fetching.
 *
 * Every outbound request the product makes on a user's behalf goes through
 * `safeFetch`, which enforces SSRF protection, a hard timeout, a response size
 * cap and a limited, validated redirect chain.
 */

import { SITE } from "@/lib/config/site";
import { BlockedRequestError, resolveAndAssertPublicHost } from "@/lib/security/ssrf";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_REDIRECTS = 5;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Follow redirects manually so each hop is revalidated against SSRF rules. */
  followRedirects?: boolean;
  acceptHeader?: string;
}

export interface SafeFetchResult {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  headers: Headers;
  contentType: string | null;
  body: string;
  bytes: number;
  responseTimeMs: number;
  redirectChain: string[];
  truncated: boolean;
}

export class FetchFailedError extends Error {
  readonly url: string;
  constructor(url: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "FetchFailedError";
    this.url = url;
  }
}

function defaultHeaders(accept: string): Record<string, string> {
  return {
    "User-Agent": SITE.crawlerUserAgent,
    Accept: accept,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
  };
}

/** Read a response body with a hard byte cap so a huge file cannot exhaust memory. */
async function readCappedText(response: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    return { text, bytes: Buffer.byteLength(text), truncated: false };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        chunks.push(value.slice(0, Math.max(0, value.byteLength - (received - maxBytes))));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { text: buffer.toString("utf8"), bytes: buffer.byteLength, truncated };
}

/**
 * Fetch a URL with SSRF protection applied to the initial request and to every
 * redirect hop. An open redirect on a public site cannot be used to reach an
 * internal address, because each `Location` is revalidated before it is followed.
 */
export async function safeFetch(
  inputUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const accept = options.acceptHeader ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  const followRedirects = options.followRedirects ?? true;

  const startedAt = Date.now();
  const redirectChain: string[] = [];
  let currentUrl = inputUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await resolveAndAssertPublicHost(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: options.method ?? "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { ...defaultHeaders(accept), ...(options.headers ?? {}) },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof BlockedRequestError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new FetchFailedError(
        currentUrl,
        aborted ? `Request timed out after ${timeoutMs}ms.` : "The site could not be reached.",
        error,
      );
    }
    clearTimeout(timer);

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");

    if (isRedirect && location && followRedirects) {
      if (hop === MAX_REDIRECTS) {
        throw new FetchFailedError(currentUrl, `Too many redirects (more than ${MAX_REDIRECTS}).`);
      }
      let next: string;
      try {
        next = new URL(location, currentUrl).toString();
      } catch {
        throw new FetchFailedError(currentUrl, "The site returned an invalid redirect target.");
      }
      redirectChain.push(next);
      currentUrl = next;
      // Drain the redirect body so the connection can be reused.
      await response.body?.cancel().catch(() => undefined);
      continue;
    }

    const { text, bytes, truncated } =
      options.method === "HEAD"
        ? { text: "", bytes: 0, truncated: false }
        : await readCappedText(response, maxBytes);

    return {
      url: inputUrl,
      finalUrl: currentUrl,
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      contentType: response.headers.get("content-type"),
      body: text,
      bytes,
      responseTimeMs: Date.now() - startedAt,
      redirectChain,
      truncated,
    };
  }

  throw new FetchFailedError(inputUrl, "Redirect limit exceeded.");
}

/** Run tasks with bounded concurrency, preserving input order in the results. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));

  async function run(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
