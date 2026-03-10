/**
 * edgar_full_text_search — Full-text search across all SEC filings.
 *
 * Uses the EDGAR Full-Text Search System (EFTS) to find filings containing
 * specific keywords. Supports date ranges, form type filters, and entity names.
 *
 * @see https://efts.sec.gov/LATEST/search-index
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { edgarFetchJson } from "../lib/fetcher.js";

interface EftsHit {
  _id: string;
  _source: {
    file_date: string;
    display_date_filed: string;
    entity_name: string;
    file_num: string;
    form_type: string;
    period_of_report?: string;
  };
  _score: number;
}

interface EftsResponse {
  hits: {
    total: { value: number };
    hits: EftsHit[];
  };
  query: string;
}

export function registerFullTextSearch(server: McpServer): void {
  server.tool(
    "edgar_full_text_search",
    "Full-text search across all SEC filings by keyword. Find filings mentioning specific drugs, technologies, risks, competitors, etc. Returns matching filings with relevance scores.",
    {
      query: z.string().describe('Search query — keywords or phrases (e.g. "GLP-1 receptor agonist", "artificial intelligence risk")'),
      form_type: z
        .string()
        .optional()
        .describe('Filter by form type (e.g. "10-K", "8-K"). Omit for all types.'),
      entity_name: z
        .string()
        .optional()
        .describe("Filter by company/entity name"),
      start_date: z
        .string()
        .optional()
        .describe("Start date filter (YYYY-MM-DD)"),
      end_date: z
        .string()
        .optional()
        .describe("End date filter (YYYY-MM-DD)"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Max results to return (default 10, max 20)"),
    },
    async ({ query, form_type, entity_name, start_date, end_date, limit }) => {
      const params = new URLSearchParams();
      params.set("q", query);
      if (form_type) params.set("forms", form_type);
      if (entity_name) params.set("entityName", entity_name);
      if (start_date || end_date) {
        params.set("dateRange", "custom");
        if (start_date) params.set("startdt", start_date);
        if (end_date) params.set("enddt", end_date);
      }

      const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;
      const data = await edgarFetchJson<EftsResponse>(url);

      const results = data.hits.hits.slice(0, limit).map((hit) => ({
        filing_id: hit._id,
        entity_name: hit._source.entity_name,
        form_type: hit._source.form_type,
        filed_date: hit._source.display_date_filed || hit._source.file_date,
        period_of_report: hit._source.period_of_report ?? null,
        relevance_score: Math.round(hit._score * 100) / 100,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                total_hits: data.hits.total.value,
                results,
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
