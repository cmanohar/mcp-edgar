/**
 * edgar_company_facts — Get all XBRL financial facts for a company.
 *
 * Returns structured financial data reported by the company across all filings:
 * revenue, net income, EPS, total assets, etc. Each fact includes the value,
 * period, form type, and filing date.
 *
 * @see https://data.sec.gov/api/xbrl/companyfacts/
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveCik } from "../lib/cik-resolver.js";
import { edgarFetchJson } from "../lib/fetcher.js";

interface UnitEntry {
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  start?: string;
}

interface FactData {
  label: string;
  description: string;
  units: Record<string, UnitEntry[]>;
}

interface CompanyFactsResponse {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, FactData>>;
}

// Key financial metrics most LLMs care about
const KEY_CONCEPTS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "NetIncomeLoss",
  "EarningsPerShareBasic",
  "EarningsPerShareDiluted",
  "Assets",
  "Liabilities",
  "StockholdersEquity",
  "OperatingIncomeLoss",
  "GrossProfit",
  "CashAndCashEquivalentsAtCarryingValue",
  "LongTermDebt",
  "CommonStockSharesOutstanding",
  "ResearchAndDevelopmentExpense",
];

export function registerCompanyFacts(server: McpServer): void {
  server.tool(
    "edgar_company_facts",
    "Get key XBRL financial facts for a company — revenue, net income, EPS, assets, liabilities, R&D expense, etc. Returns time-series data across all reported periods. Use edgar_company_concept for a deep dive into a single metric.",
    {
      ticker: z.string().describe("Stock ticker symbol (e.g. AAPL, MSFT)"),
      include_all: z
        .boolean()
        .default(false)
        .describe("If true, return ALL reported facts (can be very large). Default returns only key financial metrics."),
    },
    async ({ ticker, include_all }) => {
      const { cik, name } = await resolveCik(ticker);

      const data = await edgarFetchJson<CompanyFactsResponse>(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      );

      const facts: Record<
        string,
        { label: string; recent_values: Array<{ period: string; value: number; form: string; filed: string }> }
      > = {};

      const usgaap = data.facts["us-gaap"];
      if (!usgaap) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ticker: ticker.toUpperCase(), company: name, cik, facts: {}, note: "No US-GAAP facts found for this company." },
                null,
                2,
              ),
            },
          ],
        };
      }

      const conceptKeys = include_all ? Object.keys(usgaap) : KEY_CONCEPTS;

      for (const concept of conceptKeys) {
        const factData = usgaap[concept];
        if (!factData) continue;

        // Get the first available unit (usually "USD" or "USD/shares" or "shares")
        const unitKey = Object.keys(factData.units)[0];
        if (!unitKey) continue;
        const entries = factData.units[unitKey]!;

        // Return the most recent entries (prefer 10-K, then 10-Q)
        const annuals = entries
          .filter((e) => e.form === "10-K")
          .sort((a, b) => b.end.localeCompare(a.end))
          .slice(0, 5);

        const quarterlies = entries
          .filter((e) => e.form === "10-Q")
          .sort((a, b) => b.end.localeCompare(a.end))
          .slice(0, 4);

        const recent = [...annuals, ...quarterlies]
          .sort((a, b) => b.end.localeCompare(a.end))
          .slice(0, 8);

        if (recent.length > 0) {
          facts[concept] = {
            label: factData.label,
            recent_values: recent.map((e) => ({
              period: e.end,
              value: e.val,
              form: e.form,
              filed: e.filed,
            })),
          };
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ticker: ticker.toUpperCase(),
                company: name,
                cik,
                fact_count: Object.keys(facts).length,
                facts,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
