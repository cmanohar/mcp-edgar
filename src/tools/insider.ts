/**
 * edgar_insider_transactions — Recent insider buys and sells.
 *
 * Fetches Form 4 filings from the submissions API and extracts transaction
 * details: officer name, title, transaction type, shares, and price.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveCik } from "../lib/cik-resolver.js";
import { edgarFetchJson, edgarFetchText } from "../lib/fetcher.js";

interface SubmissionsResponse {
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      primaryDocument: string[];
    };
  };
}

interface Form4Transaction {
  officer: string;
  title: string;
  transaction_date: string;
  transaction_type: string;
  shares: number | null;
  price_per_share: number | null;
  shares_owned_after: number | null;
  filed_date: string;
  accession_number: string;
}

function parseForm4Xml(xml: string, filedDate: string, accessionNumber: string): Form4Transaction[] {
  const transactions: Form4Transaction[] = [];

  // Extract reporting owner
  const ownerMatch = xml.match(/<rptOwnerName>([^<]+)<\/rptOwnerName>/);
  const titleMatch = xml.match(/<officerTitle>([^<]+)<\/officerTitle>/);
  const officer = ownerMatch?.[1]?.trim() ?? "Unknown";
  const title = titleMatch?.[1]?.trim() ?? "";

  // Extract non-derivative transactions
  const txnRegex = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g;
  let match;
  while ((match = txnRegex.exec(xml)) !== null) {
    const block = match[1]!;

    const dateMatch = block.match(/<transactionDate>[\s\S]*?<value>([^<]+)<\/value>/);
    const codeMatch = block.match(/<transactionCode>([^<]+)<\/transactionCode>/);
    const sharesMatch = block.match(/<transactionAmounts>[\s\S]*?<transactionShares>[\s\S]*?<value>([^<]+)<\/value>/);
    const priceMatch = block.match(/<transactionPricePerShare>[\s\S]*?<value>([^<]+)<\/value>/);
    const ownedMatch = block.match(/<sharesOwnedFollowingTransaction>[\s\S]*?<value>([^<]+)<\/value>/);

    const code = codeMatch?.[1] ?? "";
    let txnType = "Unknown";
    if (code === "P") txnType = "Purchase";
    else if (code === "S") txnType = "Sale";
    else if (code === "A") txnType = "Award";
    else if (code === "M") txnType = "Exercise";
    else if (code === "G") txnType = "Gift";
    else if (code === "F") txnType = "Tax Withholding";
    else txnType = `Other (${code})`;

    transactions.push({
      officer,
      title,
      transaction_date: dateMatch?.[1]?.trim() ?? filedDate,
      transaction_type: txnType,
      shares: sharesMatch?.[1] ? parseFloat(sharesMatch[1]) : null,
      price_per_share: priceMatch?.[1] ? parseFloat(priceMatch[1]) : null,
      shares_owned_after: ownedMatch?.[1] ? parseFloat(ownedMatch[1]) : null,
      filed_date: filedDate,
      accession_number: accessionNumber,
    });
  }

  return transactions;
}

export function registerInsider(server: McpServer): void {
  server.tool(
    "edgar_insider_transactions",
    "Get recent insider transactions (Form 4 filings) for a company — purchases, sales, awards, exercises. Shows officer name, title, shares, price, and date.",
    {
      ticker: z.string().describe("Stock ticker symbol (e.g. NVDA, AAPL)"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Max Form 4 filings to parse (default 10, max 20). Each filing may contain multiple transactions."),
    },
    async ({ ticker, limit }) => {
      const { cik, name } = await resolveCik(ticker);

      const submissions = await edgarFetchJson<SubmissionsResponse>(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
      );

      const { accessionNumber, form, filingDate, primaryDocument } =
        submissions.filings.recent;

      // Collect Form 4 filings
      const form4s: Array<{ accession: string; filed: string; doc: string }> = [];
      for (let i = 0; i < accessionNumber.length && form4s.length < limit; i++) {
        if (form[i] === "4") {
          form4s.push({
            accession: accessionNumber[i]!,
            filed: filingDate[i]!,
            doc: primaryDocument[i]!,
          });
        }
      }

      // Parse each Form 4 (parallel, respecting rate limits via fetcher)
      const allTransactions: Form4Transaction[] = [];

      for (const f4 of form4s) {
        try {
          const cleanAccession = f4.accession.replace(/-/g, "");
          const numericCik = parseInt(cik, 10);
          const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${cleanAccession}/${f4.doc}`;
          const xml = await edgarFetchText(xmlUrl);
          const txns = parseForm4Xml(xml, f4.filed, f4.accession);
          allTransactions.push(...txns);
        } catch {
          // Skip unparseable Form 4s
        }
      }

      // Sort by transaction date descending
      allTransactions.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ticker: ticker.toUpperCase(),
                company: name,
                cik,
                form4_filings_parsed: form4s.length,
                total_transactions: allTransactions.length,
                transactions: allTransactions,
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
