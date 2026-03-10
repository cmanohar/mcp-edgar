#!/usr/bin/env node

/**
 * mcp-edgar — MCP server for SEC EDGAR filings, financials, and insider transactions.
 *
 * No API key required. SEC EDGAR is entirely public.
 *
 * Usage:
 *   npx mcp-edgar              # stdio transport (for Claude Code, Cursor, etc.)
 *   npx mcp-edgar --sse 3100   # SSE transport on port 3100
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerSearch } from "./tools/search.js";
import { registerFiling } from "./tools/filing.js";
import { registerSection } from "./tools/section.js";
import { registerFullTextSearch } from "./tools/full-text.js";
import { registerCompanyFacts } from "./tools/company-facts.js";
import { registerCompanyConcept } from "./tools/company-concept.js";
import { registerInsider } from "./tools/insider.js";
import { registerCompanyInfo } from "./tools/company-info.js";

const server = new McpServer({
  name: "mcp-edgar",
  version: "0.1.0",
});

// Register all 8 tools
registerSearch(server);
registerFiling(server);
registerSection(server);
registerFullTextSearch(server);
registerCompanyFacts(server);
registerCompanyConcept(server);
registerInsider(server);
registerCompanyInfo(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-edgar server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
