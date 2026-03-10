/**
 * edgar_search — Search SEC filings by ticker and form type.
 *
 * Uses the EDGAR submissions API to find recent filings for a company.
 * Returns filing metadata including accession numbers needed by other tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveCik } from "../lib/cik-resolver.js";
import { edgarFetchJson } from "../lib/fetcher.js";

interface SubmissionsResponse {
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export function registerSearch(server: McpServer): void {
  server.tool(
    "edgar_search",
    "Search SEC EDGAR for recent filings by a public company ticker. Returns filing metadata including accession numbers needed for edgar_get_filing and edgar_get_section.",
    {
      ticker: z.string().describe("Stock ticker symbol (e.g. NVDA, AAPL, MSFT)"),
      form_type: z
        .enum(["10-K", "10-Q", "8-K", "DEF 14A", "S-1", "20-F", "6-K"])
        .default("10-K")
        .describe("SEC form type to filter by"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(5)
        .describe("Max filings to return (default 5, max 20)"),
    },
    async ({ ticker, form_type, limit }) => {
      const { cik, name } = await resolveCik(ticker);

      const data = await edgarFetchJson<SubmissionsResponse>(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
      );

      const { accessionNumber, form, filingDate, reportDate, primaryDocument } =
        data.filings.recent;

      const filings = [];
      for (let i = 0; i < accessionNumber.length && filings.length < limit; i++) {
        if (form[i] === form_type) {
          filings.push({
            accession_number: accessionNumber[i]!,
            form_type: form[i]!,
            filed_date: filingDate[i]!,
            period_of_report: reportDate[i]!,
            primary_document: primaryDocument[i]!,
            cik,
          });
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { ticker: ticker.toUpperCase(), company: name, cik, form_type, filings },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
