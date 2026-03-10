/**
 * edgar_get_section — Extract a specific section from an SEC filing.
 *
 * Fetches the primary HTML document and uses regex to locate and extract
 * standard sections: MD&A, Risk Factors, Business, Financials, or full text.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { edgarFetchText } from "../lib/fetcher.js";

const SECTION_PATTERNS: Record<string, RegExp[]> = {
  mda: [
    /management.{0,10}s discussion and analysis/i,
    /item\s+7[^a-z]/i,
  ],
  risk_factors: [
    /risk factors/i,
    /item\s+1a[^a-z]/i,
  ],
  business: [
    /description of business/i,
    /item\s+1[^a-z0-9]/i,
  ],
  financials: [
    /financial statements/i,
    /item\s+8[^a-z]/i,
  ],
};

const MAX_SECTION_LENGTH = 12_000;

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

export function registerSection(server: McpServer): void {
  server.tool(
    "edgar_get_section",
    "Extract a specific section (MD&A, Risk Factors, Business, or Financials) from an SEC filing. Returns up to 12,000 characters of the section text.",
    {
      accession_number: z.string().describe("Accession number from edgar_search"),
      cik: z.string().describe("CIK (10-digit string) from edgar_search"),
      primary_document: z
        .string()
        .describe("Primary document filename from edgar_search (e.g. nvda-20240128.htm)"),
      section: z
        .enum(["mda", "risk_factors", "business", "financials", "full"])
        .describe("Which section to extract"),
    },
    async ({ accession_number, cik, primary_document, section }) => {
      const cleanAccession = accession_number.replace(/-/g, "");
      const numericCik = parseInt(cik, 10);
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${cleanAccession}/${primary_document}`;

      const html = await edgarFetchText(docUrl);
      const text = stripHtml(html);

      if (section === "full") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { section: "full", url: docUrl, content: text.slice(0, MAX_SECTION_LENGTH) },
                null,
                2,
              ),
            },
          ],
        };
      }

      const patterns = SECTION_PATTERNS[section] ?? [];
      let bestStart = -1;
      let sectionTitle: string = section;

      for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match && (bestStart === -1 || match.index < bestStart)) {
          bestStart = match.index;
          sectionTitle = match[0];
        }
      }

      if (bestStart === -1) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  section,
                  url: docUrl,
                  content: text.slice(0, MAX_SECTION_LENGTH),
                  note: "Section heading not found in document; returning start of filing text.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const sectionText = text.slice(bestStart);
      // Find next Item heading to delimit section end
      const nextSectionMatch = /\bItem\s+\d+[a-z]?\b/i.exec(sectionText.slice(300));
      const endOffset = nextSectionMatch
        ? 300 + nextSectionMatch.index
        : MAX_SECTION_LENGTH;
      const content = sectionText.slice(0, Math.min(endOffset, MAX_SECTION_LENGTH));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ section: sectionTitle, url: docUrl, content }, null, 2),
          },
        ],
      };
    },
  );
}
