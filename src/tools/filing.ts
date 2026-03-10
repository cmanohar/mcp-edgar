/**
 * edgar_get_filing — Retrieve document index for a specific SEC filing.
 *
 * Given an accession number and CIK (from edgar_search), returns the list of
 * documents in the filing package (primary document, exhibits, etc.).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { edgarFetch } from "../lib/fetcher.js";

export function registerFiling(server: McpServer): void {
  server.tool(
    "edgar_get_filing",
    "Retrieve SEC filing metadata and document index for a specific filing. Returns the list of documents in the filing package.",
    {
      accession_number: z.string().describe("Accession number from edgar_search (e.g. 0001045810-24-000032)"),
      cik: z.string().describe("CIK (10-digit string) from edgar_search"),
    },
    async ({ accession_number, cik }) => {
      const cleanAccession = accession_number.replace(/-/g, "");
      const formattedAccession = accession_number.includes("-")
        ? accession_number
        : `${accession_number.slice(0, 10)}-${accession_number.slice(10, 12)}-${accession_number.slice(12)}`;
      const numericCik = parseInt(cik, 10);
      const filingIndexUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${cleanAccession}/${formattedAccession}-index.json`;

      const res = await edgarFetch(filingIndexUrl);

      if (!res.ok) {
        const browseUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${cleanAccession}/`;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  accession_number,
                  cik,
                  url: browseUrl,
                  note: "Document index not available in JSON format. Use edgar_get_section to extract content directly, or browse the filing at the URL above.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const data = (await res.json()) as {
        form?: string;
        filingDate?: string;
        reportDate?: string;
        documents?: Array<{ name: string; type: string; description: string }>;
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                accession_number,
                cik,
                form_type: data.form,
                filed_date: data.filingDate,
                period: data.reportDate,
                documents: data.documents?.slice(0, 15) ?? [],
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
