# mcp-edgar: What It Is and How It Was Built (Plain English)

## What is this?

mcp-edgar is a plugin that lets AI assistants (like Claude) look up information from the SEC — the U.S. government agency that tracks everything public companies report about their finances, leadership, and business operations.

Think of it like giving an AI a library card to the SEC's public database, so it can answer questions like "How much revenue did Apple make last year?" or "Did any Nvidia executives sell stock recently?" by going straight to the official source.

## Why does it exist?

The SEC has a massive public database called EDGAR. It's free and open to anyone — but it's designed for humans clicking through web pages, not for AI. This plugin translates between what the AI needs and what the SEC's database provides.

## What can it do?

It has 8 capabilities:

1. **Find filings** — Search for a company's official reports (annual reports, quarterly earnings, etc.)
2. **Open a filing** — See the list of documents inside a specific report
3. **Read a section** — Pull out a specific part of a report, like the "Risk Factors" or "Management Discussion"
4. **Keyword search** — Search across all SEC filings for specific words or phrases
5. **Get financials** — Pull structured numbers like revenue, profit, debt, and earnings per share
6. **Track a single metric** — See how one number (like revenue) changed over many years
7. **Insider trading** — See when company executives bought or sold their own stock
8. **Company info** — Get basic facts: industry, location, stock exchanges, former names

## How was it built?

**Step 1: Set up the project.** Created the folder structure and installed the necessary software libraries.

**Step 2: Built two shared utilities.**
- A "speed limiter" that makes sure we don't overwhelm the SEC's servers (they ask for no more than 10 requests per second)
- A "ticker translator" that converts stock symbols like "AAPL" into the ID numbers the SEC actually uses internally

**Step 3: Built the 8 capabilities** listed above, each in its own file for clean organization.

**Step 4: Wired everything together** into a single program that AI assistants can talk to.

**Step 5: Tested it** by connecting it to Claude and asking real questions.

**Step 6: Wrote documentation** so other people can use it.

**Step 7: Published it** to npm (a public software registry), so anyone can install it with a single command.

## Key design choices

- **No passwords or API keys needed** — the SEC's data is completely public
- **Users type stock tickers** (like MSFT), not obscure government ID numbers — the plugin handles the translation
- **Built-in politeness** — automatically limits how fast it talks to SEC servers, so it follows their rules
- **Keeps responses manageable** — caps text extracts at 12,000 characters so the AI doesn't get overwhelmed by 200-page filings

## Deployment options: npm vs. self-hosting

There are two main ways to distribute an MCP server like this. We chose npm, but self-hosting is a valid alternative. Here's the trade-off:

### Option A: Publish to npm (what we did)

npm is a public registry for JavaScript packages. Publishing there means anyone can install and run mcp-edgar with a single command — no downloading source code, no setup.

**Pros:**
- **Zero-friction setup** — users just add one line to their config and it works (`npx -y mcp-edgar`)
- **Automatic updates** — when we publish a new version, users get it next time they run `npx`
- **Discoverability** — people can find it by searching npm for "SEC EDGAR MCP"
- **No infrastructure to maintain** — npm hosts the package for free; there's no server to keep running
- **Runs locally** — the plugin runs on the user's own machine, so there's no latency from a middleman server and no usage costs for us

**Cons:**
- **Runs on the user's machine** — requires Node.js installed locally
- **No centralized control** — we can't monitor usage, enforce rate limits across all users, or add authentication
- **SEC rate limits are per-user** — if someone abuses it, that's on their IP address, not ours, but we also can't prevent it
- **No shared caching** — every user fetches the same data independently; there's no shared cache to reduce load on SEC servers

### Option B: Self-host as a web service

Instead of publishing a package, we could run the MCP server on a cloud platform (like Railway, Fly.io, or AWS) and have users connect to it over the internet.

**Pros:**
- **No local setup** — users don't need Node.js; they just point their AI assistant at a URL
- **Centralized caching** — one server can cache SEC responses and serve them to many users, reducing redundant requests
- **Usage monitoring** — we can track how many requests are made, by whom, and add rate limiting or authentication
- **Easier to add features** — database-backed features (saved searches, alerts) become possible

**Cons:**
- **We pay for hosting** — someone has to run and pay for the server 24/7, even if nobody's using it
- **Added latency** — requests go: user → our server → SEC → our server → user, instead of directly user → SEC
- **Single point of failure** — if our server goes down, nobody can use the tool
- **Complexity** — need to handle authentication, HTTPS, deployment pipelines, uptime monitoring
- **Scaling** — if it gets popular, we need to handle load balancing and potentially pay significantly more

### Why we chose npm

For a tool like this — public data, no user accounts, simple request-response pattern — npm distribution is the clear winner. There's nothing to host, nothing to pay for, and users get the fastest possible experience (direct connection to SEC). Self-hosting would only make sense if we wanted to build a commercial product with accounts, caching, and premium features on top.

## Who is it for?

Anyone using an AI assistant (Claude Code, Cursor, etc.) who wants to research public companies using official SEC data rather than relying on third-party summaries.
