# mcp-edgar

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives LLMs direct access to SEC EDGAR — search filings, extract sections, pull structured financials, and track insider transactions.

**No API key required.** SEC EDGAR is entirely public.

## Quick Start

Add to your MCP client config (Claude Code, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "sec-edgar": {
      "command": "npx",
      "args": ["-y", "mcp-edgar"]
    }
  }
}
```

That's it. No configuration needed.

## Tools

### Filing Discovery

| Tool | Description |
|------|-------------|
| `edgar_search` | Search filings by ticker + form type (10-K, 10-Q, 8-K, DEF 14A, S-1, 20-F, 6-K) |
| `edgar_full_text_search` | Full-text keyword search across all SEC filings — find filings mentioning specific drugs, technologies, risks, etc. |
| `edgar_company_info` | Company metadata — name, SIC code, industry, state of incorporation, fiscal year end, recent filing summary |

### Filing Content

| Tool | Description |
|------|-------------|
| `edgar_get_filing` | Get document index for a specific filing (list of exhibits, primary document, etc.) |
| `edgar_get_section` | Extract MD&A, Risk Factors, Business, or Financials from a filing (up to 12K chars) |

### Structured Financial Data (XBRL)

| Tool | Description |
|------|-------------|
| `edgar_company_facts` | All key financials — revenue, net income, EPS, assets, liabilities, R&D, cash, debt. Time-series across periods. |
| `edgar_company_concept` | Deep dive into a single metric (e.g. Revenue) across all filing periods. Full time-series with fiscal year/quarter breakdowns. |

### Insider Transactions

| Tool | Description |
|------|-------------|
| `edgar_insider_transactions` | Recent insider buys, sells, awards, exercises from Form 4 filings. Officer name, title, shares, price. |

## Example Prompts

Once connected, you can ask your LLM:

- *"What are NVIDIA's most recent 10-K filings?"*
- *"Extract the Risk Factors section from Apple's latest annual report"*
- *"Show me Tesla's revenue trend over the last 5 years"*
- *"Who has been buying or selling MSFT stock recently?"*
- *"Find all SEC filings mentioning 'GLP-1 receptor agonist' in 2024"*
- *"Compare Amazon and Google's R&D spending over the past 3 years"*
- *"What's Pfizer's SIC industry code and fiscal year end?"*

## Typical Workflow

Most analysis follows this pattern:

```
1. edgar_company_info    → Get company overview and CIK
2. edgar_search          → Find specific filings (10-K, 10-Q, 8-K)
3. edgar_get_section     → Read MD&A, Risk Factors, etc.
4. edgar_company_facts   → Pull structured financials for comparison
5. edgar_insider_transactions → Check insider activity
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEC_EDGAR_USER_AGENT` | `mcp-edgar/0.1.0 (github url)` | SEC requires a User-Agent with company name and email. Override this to identify yourself. |

## Rate Limiting

The server includes a built-in rate limiter (10 requests/sec) to comply with SEC's [fair access policy](https://www.sec.gov/os/accessing-edgar-data). No configuration needed.

## Development

```bash
git clone https://github.com/chinmaypatil/mcp-edgar.git
cd mcp-edgar
npm install
npm run build
node dist/index.js  # runs on stdio
```

## How It Works

This server wraps three SEC EDGAR APIs:

- **Submissions API** (`data.sec.gov/submissions/`) — company info, filing history
- **XBRL API** (`data.sec.gov/api/xbrl/`) — structured financial data
- **EFTS** (`efts.sec.gov/LATEST/`) — full-text search across all filings
- **Archives** (`sec.gov/Archives/edgar/`) — raw filing documents (HTML, XML)

All APIs are free, public, and require no authentication — just a descriptive User-Agent header.

## License

MIT
