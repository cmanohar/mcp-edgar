/**
 * Resolve stock ticker symbols to SEC CIK numbers.
 *
 * Downloads the full company tickers JSON from SEC and caches it in memory.
 * The cache refreshes every 24 hours.
 */

import { edgarFetchJson } from "./fetcher.js";

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerMap: Map<string, { cik: string; name: string }> | null = null;
let cacheExpiry = 0;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

async function loadTickers(): Promise<Map<string, { cik: string; name: string }>> {
  if (tickerMap && Date.now() < cacheExpiry) {
    return tickerMap;
  }

  const data = await edgarFetchJson<Record<string, TickerEntry>>(TICKERS_URL);
  const map = new Map<string, { cik: string; name: string }>();

  for (const entry of Object.values(data)) {
    map.set(entry.ticker.toUpperCase(), {
      cik: String(entry.cik_str).padStart(10, "0"),
      name: entry.title,
    });
  }

  tickerMap = map;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return map;
}

/**
 * Resolve a ticker symbol to a 10-digit zero-padded CIK string.
 * Throws if the ticker is not found.
 */
export async function resolveCik(
  ticker: string,
): Promise<{ cik: string; name: string }> {
  const map = await loadTickers();
  const upper = ticker.toUpperCase();
  const entry = map.get(upper);
  if (!entry) {
    throw new Error(
      `Could not resolve CIK for ticker "${ticker}". ` +
        `Ensure the ticker is listed on SEC EDGAR.`,
    );
  }
  return entry;
}

/**
 * Search tickers by partial match (for autocomplete-style lookups).
 */
export async function searchTickers(
  query: string,
  limit = 10,
): Promise<Array<{ ticker: string; cik: string; name: string }>> {
  const map = await loadTickers();
  const upper = query.toUpperCase();
  const results: Array<{ ticker: string; cik: string; name: string }> = [];

  for (const [ticker, entry] of map) {
    if (
      ticker.startsWith(upper) ||
      entry.name.toUpperCase().includes(upper)
    ) {
      results.push({ ticker, ...entry });
      if (results.length >= limit) break;
    }
  }
  return results;
}
