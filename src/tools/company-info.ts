/**
 * edgar_company_info — Company metadata from SEC EDGAR.
 *
 * Returns company name, CIK, SIC code, industry classification, state of
 * incorporation, fiscal year end, and a summary of recent filing activity.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveCik } from "../lib/cik-resolver.js";
import { edgarFetchJson } from "../lib/fetcher.js";

interface SubmissionsResponse {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  ein: string;
  stateOfIncorporation: string;
  fiscalYearEnd: string;
  formerNames: Array<{ name: string; from: string; to: string }>;
  filings: {
    recent: {
      form: string[];
      filingDate: string[];
    };
  };
}

export function registerCompanyInfo(server: McpServer): void {
  server.tool(
    "edgar_company_info",
    "Get company metadata from SEC EDGAR — name, CIK, SIC industry code, state of incorporation, fiscal year end, ticker/exchange info, former names, and recent filing summary.",
    {
      ticker: z.string().describe("Stock ticker symbol (e.g. NVDA, AAPL, MSFT)"),
    },
    async ({ ticker }) => {
      const { cik } = await resolveCik(ticker);

      const data = await edgarFetchJson<SubmissionsResponse>(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
      );

      // Summarize recent filing activity by form type
      const formCounts: Record<string, number> = {};
      const recentForms = data.filings.recent.form.slice(0, 100);
      for (const form of recentForms) {
        formCounts[form] = (formCounts[form] ?? 0) + 1;
      }

      // Most recent filing date
      const lastFilingDate = data.filings.recent.filingDate[0] ?? null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ticker: ticker.toUpperCase(),
                company_name: data.name,
                cik: data.cik,
                entity_type: data.entityType,
                sic_code: data.sic,
                sic_description: data.sicDescription,
                state_of_incorporation: data.stateOfIncorporation || null,
                fiscal_year_end: data.fiscalYearEnd
                  ? `${data.fiscalYearEnd.slice(0, 2)}/${data.fiscalYearEnd.slice(2)}`
                  : null,
                tickers: data.tickers,
                exchanges: data.exchanges,
                ein: data.ein || null,
                former_names: data.formerNames?.slice(0, 5) ?? [],
                last_filing_date: lastFilingDate,
                recent_filing_summary: formCounts,
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
