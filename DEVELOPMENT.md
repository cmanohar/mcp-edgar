# How the mcp-edgar MCP Server Was Developed — Step-by-Step

## Context

This documents the development process for `mcp-edgar`, an MCP server that gives LLMs direct access to SEC EDGAR data. The server has 8 tools, uses TypeScript + the MCP SDK, requires no API keys, and is published to npm.

---

## Step 1: Project Scaffolding

1. Create directory and initialize npm:
   ```bash
   mkdir mcp-edgar && cd mcp-edgar
   npm init -y
   ```
2. Install dependencies:
   ```bash
   npm install @modelcontextprotocol/sdk
   npm install -D typescript @types/node
   ```
3. Configure `tsconfig.json`:
   - Target: ES2022, Module: Node16 (ESM)
   - Strict mode, declaration files, source maps
   - `outDir: ./dist`, `rootDir: ./src`
4. Configure `package.json`:
   - Set `"type": "module"` (ESM)
   - Add `"bin": { "mcp-edgar": "dist/index.js" }` for CLI usage via `npx`
   - Add scripts: `build` (tsc), `dev` (tsc --watch), `start` (node dist/index.js), `prepublishOnly` (build)
   - Set `"files": ["dist"]` so only compiled output is published
   - Set `"engines": { "node": ">=18" }`
5. Create directory structure:
   ```
   src/
   ├── index.ts          # Entry point
   ├── lib/              # Shared utilities
   └── tools/            # One file per tool
   ```

---

## Step 2: Build the Shared Libraries

### 2a. Rate-Limited Fetcher (`src/lib/fetcher.ts`)

SEC EDGAR requires a descriptive User-Agent and recommends max 10 requests/sec.

1. Implement a **token-bucket rate limiter**: 10 tokens max, refills at 10/sec
2. Before each fetch, wait if no tokens available
3. Set default `User-Agent: mcp-edgar/0.1.0 (repo-url)`, overridable via `SEC_EDGAR_USER_AGENT` env var
4. Set `Accept: application/json` header
5. Export three functions:
   - `edgarFetch(url)` — raw Response
   - `edgarFetchJson<T>(url)` — parsed JSON, throws on HTTP errors
   - `edgarFetchText(url)` — text body, throws on HTTP errors

### 2b. CIK Resolver (`src/lib/cik-resolver.ts`)

SEC APIs use CIK numbers, not tickers. Need a mapping layer.

1. Download ticker→CIK map from `https://www.sec.gov/files/company_tickers.json`
2. Cache in memory for 24 hours, auto-refresh on expiry
3. Export `resolveCik(ticker)` — returns `{ cik: string (zero-padded to 10 digits), name: string }`
4. Export `searchTickers(query, limit)` — partial match on ticker prefix or company name

---

## Step 3: Implement the 8 Tools (one file each in `src/tools/`)

Each tool follows the same pattern:
```typescript
export function registerToolName(server: McpServer): void {
  server.tool(
    "tool_name",
    "Human-readable description",
    { /* Zod schema for params */ },
    async (params) => {
      // 1. Resolve ticker → CIK (if needed)
      // 2. Fetch from SEC API
      // 3. Transform/filter response
      // 4. Return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
    }
  );
}
```

### Tool 1: `edgar_search` (search.ts) — Filing Discovery
- Params: ticker, form_type (enum), limit
- API: `data.sec.gov/submissions/CIK{cik}.json`
- Logic: Resolve CIK → fetch submissions → filter by form type → return filing list with accession numbers

### Tool 2: `edgar_get_filing` (filing.ts) — Filing Document Index
- Params: accession_number, cik (both from Tool 1 output)
- API: `sec.gov/Archives/edgar/data/{cik}/{cleanAccession}/{accession}-index.json`
- Logic: Strip hyphens from accession for folder path → fetch index → list up to 15 documents
- Fallback: If JSON index unavailable, return browse URL

### Tool 3: `edgar_get_section` (section.ts) — Extract Filing Sections
- Params: accession_number, cik, primary_document, section (enum: mda/risk_factors/business/financials/full)
- API: Fetch raw HTML from Archives
- Logic: Strip HTML tags/styles → use regex to find section boundaries (e.g., "Item 7" for MD&A) → extract up to 12,000 chars
- HTML processing: Remove style/script tags, decode entities, normalize whitespace

### Tool 4: `edgar_full_text_search` (full-text.ts) — Keyword Search
- Params: query, form_type, entity_name, start_date, end_date, limit
- API: `efts.sec.gov/LATEST/search-index`
- Logic: Build query string → fetch → return hits with relevance scores

### Tool 5: `edgar_company_facts` (company-facts.ts) — Structured Financials
- Params: ticker, include_all (boolean)
- API: `data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json`
- Logic: Resolve CIK → fetch all XBRL facts → filter to 14 key financial concepts (Revenue, NetIncome, EPS, Assets, etc.) unless include_all=true → return 5 annual + 4 quarterly most recent values per metric

### Tool 6: `edgar_company_concept` (company-concept.ts) — Single Metric Time Series
- Params: ticker, concept (XBRL name), taxonomy (us-gaap/dei/ifrs-full), form_filter
- API: `data.sec.gov/api/xbrl/companyconcept/CIK{cik}/{taxonomy}/{concept}.json`
- Logic: Fetch full time series → deduplicate by period_end + fiscal_period (keep most recent filing) → return 40 most recent periods

### Tool 7: `edgar_insider_transactions` (insider.ts) — Insider Trading
- Params: ticker, limit
- API: Submissions API (to find Form 4 filings) → then fetch each Form 4 XML document
- Logic: Get Form 4 filing list → fetch up to `limit` Form 4 XMLs → regex-parse XML to extract officer name, title, transaction type, shares, price → sort by date descending
- Transaction type mapping: P→Purchase, S→Sale, A→Award, M→Exercise, G→Gift, F→Tax Withholding

### Tool 8: `edgar_company_info` (company-info.ts) — Company Metadata
- Params: ticker
- API: Submissions API
- Logic: Resolve CIK → fetch → extract company name, SIC code/description, state, fiscal year end, tickers, exchanges, EIN, former names, filing summary

---

## Step 4: Wire Up the Entry Point (`src/index.ts`)

1. Add shebang `#!/usr/bin/env node` (needed for npx binary)
2. Create `McpServer` instance with name and version
3. Import and call all 8 `register*` functions
4. Create `StdioServerTransport` (stdin/stdout communication)
5. Connect server to transport
6. Log startup message to stderr (stdout is reserved for MCP protocol)

```typescript
const server = new McpServer({ name: "mcp-edgar", version: "0.1.0" });
registerSearch(server);
registerFiling(server);
registerSection(server);
registerFullTextSearch(server);
registerCompanyFacts(server);
registerCompanyConcept(server);
registerInsider(server);
registerCompanyInfo(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Step 5: Build & Test Locally

1. `npm run build` — compiles TypeScript to `dist/`
2. Test manually with `node dist/index.js` (sends/receives JSON over stdio)
3. Add to local Claude Code config to test with an LLM:
   ```json
   { "mcpServers": { "sec-edgar": { "command": "node", "args": ["/path/to/dist/index.js"] } } }
   ```
4. Verify each tool works by prompting the LLM with example queries

---

## Step 6: Documentation & Packaging

1. Write `README.md` with:
   - Quick start (npx one-liner config)
   - Tool table organized by category
   - Example prompts
   - Typical workflow diagram
   - Environment variables
   - Rate limiting note
   - "How It Works" section listing the 4 SEC APIs used
2. Add `.gitignore` (node_modules, dist)
3. Add MIT `LICENSE`
4. Add npm keywords for discoverability: mcp, sec, edgar, filings, xbrl, claude, llm

---

## Step 7: Publish

1. `git init && git add . && git commit` — initial release commit
2. `npm publish` — triggers prepublishOnly (auto-builds), publishes to npm
3. Users can now use via `npx -y mcp-edgar` with zero config

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **One tool per file** | Clean separation, easy to add/remove tools |
| **Shared rate limiter** | All tools go through one fetcher, SEC compliance guaranteed |
| **Ticker-first interface** | Users think in tickers, not CIK numbers; resolver handles mapping |
| **JSON text responses** | MCP SDK convention; LLMs parse structured JSON well |
| **Zod for validation** | MCP SDK uses Zod natively; provides type safety + LLM-readable descriptions |
| **No auth required** | SEC EDGAR is entirely public; lowers barrier to zero |
| **Token-bucket rate limit** | Smooths burst traffic to stay under 10 req/sec |
| **24h CIK cache** | Ticker→CIK map rarely changes; avoids redundant downloads |
| **12K char section limit** | Prevents LLM context overflow from huge filing sections |
| **Stdio transport** | Standard for CLI-based MCP clients (Claude Code, Cursor, etc.) |

---

## SEC EDGAR APIs Used

| API | Base URL | Purpose |
|-----|----------|---------|
| Submissions | `data.sec.gov/submissions/` | Company info, filing history |
| XBRL | `data.sec.gov/api/xbrl/` | Structured financial data |
| EFTS | `efts.sec.gov/LATEST/` | Full-text search |
| Archives | `sec.gov/Archives/edgar/` | Raw filing documents (HTML, XML) |
| Ticker Map | `www.sec.gov/files/company_tickers.json` | Ticker→CIK resolution |

All free, public, no API key — just a descriptive User-Agent header.
