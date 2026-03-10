/**
 * Rate-limited HTTP fetcher for SEC EDGAR APIs.
 *
 * SEC requires:
 * - A descriptive User-Agent header (company + email)
 * - Max 10 requests per second
 *
 * @see https://www.sec.gov/os/accessing-edgar-data
 */

const DEFAULT_USER_AGENT =
  "mcp-edgar/0.1.0 (https://github.com/chinmaypatil/mcp-edgar)";

const userAgent =
  process.env.SEC_EDGAR_USER_AGENT ?? DEFAULT_USER_AGENT;

// Simple token-bucket rate limiter: 10 requests/sec
let tokens = 10;
let lastRefill = Date.now();

function refillTokens(): void {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed > 0) {
    tokens = Math.min(10, tokens + (elapsed / 1000) * 10);
    lastRefill = now;
  }
}

async function waitForToken(): Promise<void> {
  refillTokens();
  if (tokens >= 1) {
    tokens -= 1;
    return;
  }
  // Wait until a token is available
  const waitMs = ((1 - tokens) / 10) * 1000;
  await new Promise((resolve) => setTimeout(resolve, Math.ceil(waitMs)));
  refillTokens();
  tokens -= 1;
}

/**
 * Fetch a URL from SEC EDGAR with proper User-Agent and rate limiting.
 */
export async function edgarFetch(url: string): Promise<Response> {
  await waitForToken();
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  return res;
}

/**
 * Fetch and return JSON, throwing on HTTP errors.
 */
export async function edgarFetchJson<T = unknown>(url: string): Promise<T> {
  const res = await edgarFetch(url);
  if (!res.ok) {
    throw new Error(`EDGAR API error: ${res.status} ${res.statusText} — ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * Fetch and return text, throwing on HTTP errors.
 */
export async function edgarFetchText(url: string): Promise<string> {
  const res = await edgarFetch(url);
  if (!res.ok) {
    throw new Error(`EDGAR API error: ${res.status} ${res.statusText} — ${url}`);
  }
  return res.text();
}
