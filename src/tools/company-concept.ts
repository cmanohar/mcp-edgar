/**
 * edgar_company_concept — Time series for a single financial metric.
 *
 * Returns all reported values for a specific XBRL concept (e.g. Revenue,
 * NetIncomeLoss) across all filing periods. Useful for trend analysis.
 *
 * @see https://data.sec.gov/api/xbrl/companyconcept/
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveCik } from "../lib/cik-resolver.js";
import { edgarFetchJson } from "../lib/fetcher.js";

interface ConceptUnit {
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  start?: string;
}

interface ConceptResponse {
  cik: number;
  taxonomy: string;
  tag: string;
  label: string;
  description: string;
  entityName: string;
  units: Record<string, ConceptUnit[]>;
}

export function registerCompanyConcept(server: McpServer): void {
  server.tool(
    "edgar_company_concept",
    "Get the full time series for a single XBRL financial metric (e.g. Revenues, NetIncomeLoss, EarningsPerShareDiluted, Assets). Returns all reported values across every filing period.",
    {
      ticker: z.string().describe("Stock ticker symbol (e.g. AAPL, MSFT)"),
      concept: z
        .string()
        .describe(
          "XBRL concept name — e.g. Revenues, NetIncomeLoss, EarningsPerShareDiluted, Assets, " +
            "StockholdersEquity, OperatingIncomeLoss, ResearchAndDevelopmentExpense, " +
            "CashAndCashEquivalentsAtCarryingValue, LongTermDebt, CommonStockSharesOutstanding",
        ),
      taxonomy: z
        .enum(["us-gaap", "dei", "ifrs-full"])
        .default("us-gaap")
        .describe("XBRL taxonomy (default: us-gaap)"),
      form_filter: z
        .enum(["10-K", "10-Q", "all"])
        .default("all")
        .describe("Filter by form type (default: all)"),
    },
    async ({ ticker, concept, taxonomy, form_filter }) => {
      const { cik, name } = await resolveCik(ticker);

      const data = await edgarFetchJson<ConceptResponse>(
        `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/${taxonomy}/${concept}.json`,
      );

      // Get the first available unit
      const unitKey = Object.keys(data.units)[0];
      if (!unitKey) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ticker: ticker.toUpperCase(), company: name, concept, values: [], note: "No data found for this concept." },
                null,
                2,
              ),
            },
          ],
        };
      }

      let entries = data.units[unitKey]!;

      if (form_filter !== "all") {
        entries = entries.filter((e) => e.form === form_filter);
      }

      // Sort by period end date descending
      entries.sort((a, b) => b.end.localeCompare(a.end));

      // Deduplicate: keep the most recent filing for each period
      const seen = new Set<string>();
      const deduped = entries.filter((e) => {
        const key = `${e.end}-${e.fp}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const values = deduped.slice(0, 40).map((e) => ({
        period_end: e.end,
        period_start: e.start ?? null,
        value: e.val,
        fiscal_year: e.fy,
        fiscal_period: e.fp,
        form: e.form,
        filed: e.filed,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ticker: ticker.toUpperCase(),
                company: name,
                concept,
                label: data.label,
                description: data.description,
                unit: unitKey,
                total_periods: deduped.length,
                values,
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
