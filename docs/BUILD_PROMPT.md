# Build prompt — Parts Tracker (web)

> Paste everything below the line into a fresh Claude Code session opened in `S:\Projects\parts-tracker`.

---

You are building **Parts Tracker**, a web app that tracks PC-part prices across merchants that PCPartPicker doesn't cover (mostly Portuguese/Spanish/French/UK shops), scrapes them on demand or on a schedule, stores every price point, and shows history in interactive charts.

It replaces an existing desktop Python/Tkinter app at `C:\Users\Miguel Rego\Downloads\files\files\`. **Read these before writing any code**, since they hold most of the hard-won domain knowledge:
- `pc_price_tracker.py`: scraping, matching and validation logic. Use it as a reference for requirements and edge cases, then redesign and improve it (see "Matching engine").
- `pc_tracker.json`: real data (merchants, components, refs, URLs, history). Write an import script for it.
- `diagnostico.txt`: a real scrape log that shows which shops block bots and how

Treat those files as reference data. Don't run the `.exe` or the venv inside that folder.

## Goals
1. **Multi-user with roles**:
   - **Admins** manage users and the **merchant catalog**. Each shop behaves differently (search URL, adapter overrides, currency, shipping, "sold by the shop" rule, browser needed), so only admins configure merchants.
   - **Users** create their own builds, add products, choose which of the available merchants to compare, and see prices and history.
2. **Scraping**: fetch the current price of every enabled (product × merchant) pair, both **on demand** (one pair, one product, or everything) and **on a schedule**.
3. **History**: keep every observation and never overwrite it. Show it in interactive charts.
4. **UI**: modern and elegant, dark/light/system themes, responsive from phone to desktop.
5. **Deploy**: Vercel for the app, a free hosted DB, GitHub for versioning and CI.
6. **Cost**: free tiers only. Pick the most generous free option at each layer and document its limits in the README.

## Stack (use this unless you find a concrete blocker; if so, explain and propose an alternative before switching)
| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router, latest stable) + TypeScript (strict)** | first-class on Vercel; Server Actions for admin mutations |
| UI | **Tailwind CSS v4 + shadcn/ui** (Radix) + **lucide-react** icons | elegant defaults, accessible components |
| Theming | **next-themes** (light / dark / system), CSS variables | no flash on load |
| Charts | **Recharts** via shadcn `chart` components (synced tooltips via `syncId`, `Brush` zoom, step lines, reference lines/dots); heatmap as a CSS grid | themeable with our CSS variables, light bundle; see "Interactive charts" |
| Tables | **TanStack Table** (sorting, filtering) | the comparison grid |
| DB | **Turso (libSQL)** + **Drizzle ORM** + drizzle-kit migrations | generous free tier, works from Vercel and from GitHub Actions; local dev uses a `file:` SQLite DB |
| Validation | **zod** (forms + API) with react-hook-form | |
| Auth & users | **Better Auth** with its Drizzle adapter (libSQL) and **admin plugin** (roles, ban/unban, list/create users, revoke sessions); sign-in with GitHub and Google OAuth plus email magic link via **Resend** (free tier) | free, self-hosted in our DB, with user management built in |
| Scraper runtime | **GitHub Actions** running a Node/TS scraper with **Playwright (Chromium)** | see "Scraping architecture" below |
| HTML parsing | **cheerio** | BeautifulSoup equivalent |
| HTTP | native `fetch` with browser-like headers; fall back to Playwright on 403/429/202/503 | mirrors the Python `fetch()` |
| FX rates | ECB daily XML (`eurofxref-daily.xml`), cached in DB for 6 h | same as Python `eur_rate()` |
| Tests | **Vitest** (parser/matcher unit tests using saved HTML fixtures) + **Playwright Test** (a few UI smoke tests) | |
| Lint/format | ESLint + Prettier (or Biome; choose one) | |
| Package manager | pnpm | |

Check current free-tier limits for Vercel Hobby, Turso and GitHub Actions on the web before you finalize. Record them in `README.md` → "Free-tier budget".

## Scraping architecture (important)
The diagnostics log shows that PCComponentes returns HTTP 429, Chipman returns 403 (Cloudflare), and Amazon returns 202/503. Several shops also need JavaScript to render. A Vercel serverless function is a poor fit for this: it has short timeouts, a heavy Chromium cold start, datacenter IPs, and Hobby crons are limited to roughly once a day. So:

- **Scraper = a standalone TS package** (`packages/scraper` or `scraper/`) that shares the Drizzle schema and matching code with the web app. It runs in **GitHub Actions**:
  - a `schedule:` cron workflow (default every 6 h, configurable), and
  - a `workflow_dispatch` workflow with inputs `productId?`, `merchantId?` and `runId`, for on-demand runs.
- **On-demand from the UI**: a signed-in user clicks "Check now" on their own build or product. Rate-limit this per user (e.g. 1 run per 10 min; admins unlimited), and skip pairs checked in the last N minutes because prices are shared. The click → a Server Action inserts a `scrape_runs` row (status `queued`) → it calls the GitHub REST API `workflow_dispatch` using a fine-grained PAT stored as a Vercel env var → the UI polls the run row (or uses SWR revalidation) and shows live per-pair status as the scraper writes results.
- **Optional fast path**: for merchants flagged `needsBrowser = false`, also allow a direct fetch+parse inside a Vercel route handler, so single-pair checks finish in seconds. Keep this behind a merchant flag.
- Make the repo **public** if the user agrees, because Actions minutes are then unlimited. Otherwise budget for the 2,000 min/month private limit, and say so in the README. **Ask the user about this.**
- Be polite: per-host throttling (≥1.5 s gap, max 2 concurrent per shop), retries with backoff on 429/202, a realistic UA and `Accept-Language: pt-PT`, and a Playwright init script that hides `navigator.webdriver`. Don't try to bypass CAPTCHAs. If a shop still blocks, mark the result `blocked` and move on.

## Matching engine: redesign it, don't port it
`pc_price_tracker.py` is a **requirements source and a list of lessons learned**, not code to translate. Read it to understand *what* it handles and *why*, then design a cleaner, more accurate engine in `packages/core` as pure, fully tested TypeScript. Before building, write a short design note in `docs/matching.md` and show it to me.

### Requirements kept from the Python app
- Search URL templates per merchant with `{q}`. Encoding depends on whether `{q}` is in the path or the query.
- Search by identifier first (GTIN/EAN, then MPN), then by free text.
- Plain HTTP first, browser render only when needed (JS-only page or an anti-bot status).
- Price extraction from JSON-LD, meta tags, microdata, embedded app-state JSON, and site-specific selectors. Parse European number formats (`1.234,56`).
- Reject the wrong product: every rule in "Rejection rules" below.
- **"Sold by the shop itself"** option per merchant (rejects Worten marketplace and Amazon third-party sellers).
- **URLs per pair:**
  - **Pinned URL:** never re-searched.
  - **Auto-found URL:** reused and revalidated.
  - **"Mark wrong" blocklist:** per URL or product name.
- Amazon ASIN reuse across amazon.* domains; canonical `/dp/ASIN` URLs.
- Per-merchant currency (ECB → EUR; store both original and EUR) and shipping cost.
- PCPartPicker import from pasted Markdown/text/HTML.
- A per-pair diagnostic trace viewable in the UI (it replaces `diagnostico.txt`).

### Improvements to make (the current app's weak spots)
- **Scored confidence instead of a boolean chain.** Every candidate gets a score with a breakdown of signals (identifier match, token/variant match, price plausibility, seller, condition). Each signal is a weighted contribution or a hard veto. Thresholds:
  - high → accept automatically
  - medium → **review queue**
  - low → reject

  The UI shows *why* a candidate was accepted or rejected.
- **Review queue.** An admin page lists medium-confidence matches with side-by-side reference vs candidate (name, image, price, codes), with Approve (pins the URL) or Reject (adds to the blocklist). This replaces most manual URL fiddling.
- **Proper identifier handling.** Normalize GTINs to GTIN-14 and validate check digits. UPC-12 `730143315289` and EAN-13 `0730143315289` are the same code; the old app treats them as different. Allow several GTINs per product, since regional EANs differ.
- **Learned facts with provenance.** Store where each GTIN/MPN came from (user-typed / learned from merchant X at time T / confidence). Only promote a learned code after it agrees across ≥2 merchants or the user confirms it. A wrong learned EAN (e.g. a `560…` code in the current data) must not poison every other shop.
- **Merchant adapters.** A generic adapter (search page → candidates → product page) plus optional per-merchant overrides (custom selectors, the shop's own JSON search/API endpoints when they expose one, seller detection, pagination). Adapters are configured as data in the DB where possible, so new shops need no deploy.
- **Robust title extraction.** On Amazon the old app read a "product summary" block as the name and rejected the right product. Prefer structured data, then site selectors, then `og:title`/`h1`, and sanity-check the result against the page.
- **Check the stock state** explicitly (in stock / out of stock / preorder / unknown), not as a bare boolean.
- **Regression fixtures from real failures.** `diagnostico.txt` shows the correct 9800X3D rejected at Globaldata and PCBem, missed at Radio Popular, and mis-named at Amazon.es. Capture those pages as fixtures (trimmed HTML) and make them pass.
- **Observability.** Each run stores per-pair status (`ok`/`out_of_stock`/`not_found`/`review`/`blocked`/`error`), timings and the score breakdown. Raw HTML of failures goes only to the Actions artifact, never to the DB.

### Rejection rules
Implement each rule as a named, separately tested unit in `packages/core/src/rules/` that returns `{ rule, verdict: 'veto' | 'penalty' | 'boost' | 'pass', weight, evidence }`. The UI shows the evidence: which words, which codes, which price.
- **veto** rejects outright.
- **penalty** lowers the score, so the candidate can land in the review queue.
- **boost** raises it.

Each rule gets at least one "should reject" and one "should accept" fixture, and any word list lives in a single multilingual data file (PT/ES/FR/EN/IT/DE).

**A. Kept from the old app** (from `pc_price_tracker.py`; reimplement and improve them)
| # | Rule | Old behaviour | New behaviour |
|---|---|---|---|
| A1 | Refurbished / used / outlet | regex in 6 languages (recondicionado, reacondicionado, reconditionné, refurb, renewed, usado, segunda mão, d'occasion, open box, caixa aberta, embalagem danificada, outlet, warehouse, pre-owned, ricondizionato, generalüberholt, gebraucht, grade A/B/C) on name or URL; skipped if the product itself asks for refurbished | **veto**. Also read the JSON-LD `itemCondition` (anything but `NewCondition`). |
| A2 | Model variant mismatch | the variant-word set must match exactly (Ti, Super, XT, XTX, GRE, Plus, Pro, Max, Neo, Ultra), ignoring "80 Plus", "Max Boost/Turbo/Clock/Freq" and "Boost Max" | **veto**. Make the vocabulary per category and extend it (see B1–B2). |
| A3 | 80+ tier clash | Bronze/Silver/Gold/Platinum/Titanium differ, when both sides name one | **veto**. Also cover Cybenetics tiers. |
| A4 | Price implausible | outside 0.5×–2× of the reference (in EUR) | **penalty** that scales with the distance; **veto** beyond 0.35×–3×. Use the median of recent accepted prices when there's no reference. |
| A5 | Prebuilt / laptop / bundle | gaming PC, PC gaming, prebuilt, bundle, portátil, laptop; checked only when there's no reference price | **veto** always, unless the product itself is one. Extend the words: computador, ordenador, ordinateur, kit, combo, pack, "PC completo", "+ " pairs of two parts. |
| A6 | Barcode mismatch | both ≥8 characters and different → reject, unless every search word is in the name | normalize to GTIN-14 and validate the check digit (UPC-12 = EAN-13 with a leading 0). Mismatch against a **confirmed** code → **veto**; against an unconfirmed learned code → **penalty**. A match → strong **boost**. |
| A7 | Name too weak | every digit token present AND ≥75 % of tokens | **penalty** from a weighted token similarity: model-number tokens weigh most, brand next, filler words ("processador", "gaming") least. A missing model-number token → **veto**. |
| A8 | Not a product page | URL looks like a search or listing page | **veto**. Also detect listing pages structurally (many product cards, no single `Product` node). |
| A9 | Variant / tier / refurb in a search link | A1–A3 applied to link text + slug before fetching | same rules, run as a cheap pre-filter. |
| A10 | Low link score | token score < 0.6 or a digit token missing | pre-filter only; keep the top N links and log the dropped ones. |
| A11 | Junk links | `#`, `javascript:`, `mailto:`, `tel:` | also add-to-cart / wishlist / `admin-ajax` URLs (PCBem returned `?add-to-cart=` links). |
| A12 | No price extracted | reject | `not_found` with the reason "no price", kept apart from a wrong product. |
| A13 | Not sold by the shop (`ownOnly`) | Amazon `sellerProfileTriggerId`, Worten `marketplace-seller`, "sold by X" in 8 languages; rejected if the seller page couldn't be fetched | **veto**, with the seller name as evidence. Seller detection is configurable per merchant adapter. "Seller unknown" → **penalty**, not a veto. |
| A14 | User "mark wrong" | blocklist per shop and product, by URL or name | **veto** by canonical URL, product ID (ASIN, SKU) or normalized title. Reports from users go to the review queue first. |
| A15 | Stale found URL | a found URL that now looks like a search page or is blocked gets discarded | revalidate it with the same rules every run; after 3 failures in a row, drop it and search again. |
| A16 | Pinned URL | skips every rule | keep that, but still run the rules and show a warning badge when they'd reject, e.g. the shop swapped the page to another product. |

**B. New rules** (gaps in the old app)
| # | Rule | Example | Verdict |
|---|---|---|---|
| B1 | Connectivity variant | B850 Tomahawk MAX **WIFI** vs non-WiFi; also BT, "-E", "-F" suffixes | **veto** when one side has it and the other doesn't |
| B2 | GPU sub-model / factory OC | Gaming Trio **OC** vs Gaming Trio; Ventus vs Gaming; "OC PLUS" | **veto** on a different product line; **penalty** on OC vs non-OC |
| B3 | CPU suffixes | 9800X vs **9800X3D**; 7600 vs 7600**X**; Intel K/KF/F | **veto** (treat the suffix as part of the model token) |
| B4 | Tray / OEM vs boxed | "tray", "OEM", "MPK", "sem cooler" vs box | **veto** when it differs from the reference packaging; packaging is a product field (`box`/`tray`/`any`) |
| B5 | Colour / edition | chromax.black vs brown; black vs white; "Snow", "White Edition", ARGB vs non-RGB | **veto** when the reference names a colour or edition |
| B6 | Capacity / size | 1TB vs **2TB**; 750W vs 1000W; 240 mm vs 360 mm AIO; 27" vs 32" | **veto** (parse value + unit, don't just compare digits) |
| B7 | Memory kit layout & specs | 2×16 vs 1×32 vs 2×32; DDR5-6000 vs 6400; CL30 vs CL36 | **veto** on layout, total capacity and speed; **penalty** on CL |
| B8 | Accessory *for* the part | "backplate / waterblock / cable / bracket / cover **para / for / pour / compatível com** RTX 5070 Ti" | **veto** when the part's name follows a "for/compatible with" phrase, or the category disagrees |
| B9 | Category mismatch | the reference is a CPU but the candidate's breadcrumb or JSON-LD `category` says cooler/motherboard/PC | **veto** using breadcrumbs, JSON-LD category and the URL path |
| B10 | Multipack / quantity | "pack 3", "3x", "kit de 2" fans when you want one | **veto**, or compare unit price when the product allows packs |
| B11 | Regional variant | UK-plug PSU or monitor, US model, "import" | **penalty**; **veto** on plug type for products with a mains cable when the merchant isn't UK |
| B12 | Preorder / not purchasable | "pré-venda", "preorder", "reserva", "brevemente", "esgotado" with no date | not a rejection: becomes the `preorder` / `out_of_stock` stock state, and is excluded from "cheapest in stock" |
| B13 | Price sanity | price missing currency, a monthly instalment ("12x de"), or a "from €X" listing price | **veto** that value and keep searching the page for the real price |
| B14 | Brand mismatch | brand in JSON-LD or title differs from the reference brand (MSI vs Gigabyte with the same chip) | **veto** for boards, GPUs, PSUs, cases and coolers; **penalty** for CPUs and chips, where brand text is noisy |
| B15 | Duplicate listing | the same offer under two URLs at one shop | keep the cheapest in-stock one; don't create two series in the history |

**Fixtures to capture first** (they all failed in `diagnostico.txt`)
- Globaldata and PCBem: the correct 9800X3D was rejected (must accept).
- PCBem: the tray 9800X3D (must reject under B4 when the reference is boxed).
- Radio Popular: the search page wasn't parsed (must find).
- Amazon.es: the title came from a "product summary" block (must extract the real title).
- Worten: marketplace-only results (must reject under A13 with the seller as evidence).

## Data model (Drizzle, SQLite)
**Shared vs per-user.** Products and prices form a **shared catalog**: a 9800X3D is scraped once, no matter how many users track it. Builds are **per user**. When a user adds a product, deduplicate it against the catalog by identifier (GTIN/MPN), then by normalized name, before creating a new entry.

- Better Auth tables (`user`, `session`, `account`, `verification`) plus the admin plugin fields: `role` (`admin`|`user`), `banned`, `banReason`, `banExpires`
- `app_settings`: signupMode (`open`|`approval`|`invite_only`, default `invite_only`), default cron interval, per-user rate limits
- `invites`: email, role, token, invitedBy, expiresAt, usedAt
- `audit_log`: actorUserId, action, entity, entityId, diff json, createdAt (records every admin change to users and merchants)
- `merchants` (admin-managed): id, name, slug, country, baseUrl, searchTemplate, currency, shipping, freeShippingOver, enabled, visibleToUsers, ownOnly, needsBrowser, adapterConfig json (selectors, API endpoint, seller rules, throttle gap, max concurrency), notes, sortOrder, color, lastHealth (ok/degraded/blocked), lastHealthAt
- `products` (shared catalog): id, name, category, query, imageUrl, refUrl, brand, refPrice, createdBy, archived
- `builds`: id, userId, name, notes, isPublic (shareable read-only link), createdAt
- `build_items`: buildId, productId, quantity, sortOrder, boughtAt, boughtPrice, boughtMerchantId
- `user_merchants`: userId, merchantId, enabled (which of the available merchants the user compares; defaults to all visible)
- `product_identifiers`: productId, kind (`gtin`|`mpn`|`asin`), value (GTIN normalized to 14 digits), source (`user`|`learned`), sourceMerchantId, confidence, confirmed, createdAt
- `match_candidates`: productId, merchantId, url, title, priceEur, score, signals json, status (`pending`|`approved`|`rejected`), runId
- `product_merchant`: productId, merchantId, manualUrl, autoUrl, enabled, lastStatus, lastPriceEur, lastCheckedAt (current state; PK = pair)
- `blocklist`: productId, merchantId, url?, name?, createdAt
- `price_points`: id, productId, merchantId, ts, priceEur, priceOrig, currency, shipping, inStock, url, title, runId. Append-only, indexed on (productId, merchantId, ts).
- `scrape_runs`: id, trigger (`cron`|`manual`), scope, status, startedAt, finishedAt, stats json, ghRunUrl
- `scrape_logs`: runId, productId, merchantId, status (`ok`|`out_of_stock`|`not_found`|`blocked`|`error`), message, log text (truncated)
- `fx_rates`: currency, rate, fetchedAt

Write `scripts/import-legacy.ts` that loads `pc_tracker.json` into this schema, **including the full price history**. It assigns the components to a build owned by the first admin; the bought flags go to `build_items`. The legacy `history` entries are `{t, p, s, u, o?, cur?}`.

## Pages
- **Dashboard** (`/`): total build cost (cheapest in-stock per product, plus shipping), savings against reference prices, a "best price changed" feed, last run status, and a "Check all" button.
- **Comparison grid** (`/compare`): products × merchants with the cheapest cell highlighted, stock badges, cell click → open product page, a cell menu (pin URL, mark wrong, check now, view log), and column toggles. On mobile it becomes stacked cards per product.
- **Product detail** (`/products/[id]`): an interactive price-history line chart (one series per merchant, legend toggle, range 7d/30d/90d/all, min/max/avg markers, tooltip showing price+shipping), a table of the latest offers, and the diagnostic log per merchant.
- **My builds** (`/builds`, `/builds/[id]`): the user's builds; add products (search the catalog, paste a shop URL, or import from PCPartPicker), set quantities, mark items bought, see the build total over time, and share a read-only link.
- **Settings** (`/settings`): profile, connected sign-in methods, which merchants to compare, theme.
- **Admin area** (`/admin/*`, role `admin` only; its own sidebar layout):
  - **Users**: list/search, invite by email, change role, ban/unban, revoke sessions, delete (with confirmation), see each user's builds; signup mode setting.
  - **Merchants**: CRUD, enable/disable, hide from users, drag-to-reorder, and an adapter config editor with form fields for the common options plus a JSON editor (validated with zod) for overrides. Includes **"Test merchant"**, which runs one search for a chosen product and shows what the adapter fetched, extracted and scored, and a health badge from recent runs.
  - **Catalog**: shared products, identifiers (confirm/remove learned codes), merging duplicate products.
  - **Review queue**: medium-confidence matches, plus "wrong match" reports from users.
  - **Runs**: history, logs, re-run, cron interval.
  - **Audit log.**
- **Permissions**:
  - Enforce everything server-side: every Server Action and route checks the session and role. Never rely only on hiding UI.
  - Users can edit only their own builds and settings.
  - Users can **report** a wrong match; only admins pin URLs, edit blocklists, change identifiers or touch merchants.
  - Shared build links are read-only and need no sign-in.
- The first user is created as admin via `pnpm seed:admin --email ...`. With signup set to `invite_only`, nobody else can join without an invite.

## Interactive charts
Charts are a core feature, not decoration. Load the `dataviz` skill before writing any chart code, and follow its palette and mark rules.

**Charts**
1. **Price history** (product page, the main chart):
   - **Lines:** one line per merchant, drawn as a **step line** (prices change at discrete moments; don't interpolate). The y-axis switches between price only and price + shipping.
   - **Gaps:** out-of-stock stretches are dashed or faded; missing data leaves a gap, not a bridge.
   - **Markers:** the all-time low per merchant, the current price, a horizontal **reference price** line, and an annotation at the date you bought the part.
   - **Lowest-price band:** a shaded area showing the cheapest in-stock price across all merchants over time.
2. **Build total over time** (build page and dashboard): the cheapest in-stock total of the build, drawn as an area stacked by category (CPU/GPU/…). Includes a line for the sum of reference prices, and a toggle between "cheapest anywhere" and "cheapest at a single merchant".
3. **Current offers** (product page): horizontal bars, one per merchant, sorted by price, with shipping stacked on top. The cheapest bar is highlighted, and out-of-stock offers are muted.
4. **Price-gap heatmap** (comparison page): products × merchants, each cell coloured by % above the best price (sequential palette). Cells show the price on hover and open the offer on click.
5. **Sparklines**: a 30-day trend in every table row and KPI tile (dashboard, builds, catalog).
6. **Biggest movers** (dashboard): a diverging bar chart of the largest drops and rises over the last 7/30 days.
7. **Merchant health** (admin): success/blocked/not-found rate per merchant per day, and run duration over time.

**Interactions** (all charts where they make sense)
- **Hover:** a crosshair tooltip lists each merchant sorted by price, with price, shipping, stock and time. Tooltips are **synced** across the charts on a page (`syncId`).
- **Legend:** click a merchant to toggle it, hover to highlight it and dim the others. Double-click isolates one merchant.
- **Time range:** presets 7d / 30d / 90d / 1y / All, plus a **brush** under the history chart for zoom and pan.
- **Click a point:** opens a popover with the scraped title, a link to the shop page at that time, and the run log.
- **Shareable state:** range, selected merchants and the shipping toggle are stored in the URL query, so a link reproduces the view.
- **Export:** PNG of the chart and CSV of the visible data.
- **Touch:** tap shows a tooltip, drag scrubs; on phones the brush becomes range chips and the legend becomes a horizontal scroll of chips.
- **Accessibility:** every chart has a keyboard-reachable "View as table" toggle and an `aria-label` summary ("Lowest €399.90 at PCDiga, down 6 % in 30 days"). Don't rely on colour alone: line styles or markers distinguish series too.

**Data and performance**
- Each merchant gets a stable colour (`merchants.color`, assigned from a validated categorical palette), checked for contrast in both themes. A merchant keeps its colour on every chart.
- The server returns only the visible range. Above about 500 points per series, downsample (daily min/close, or LTTB) in a route handler. Cache responses with `revalidateTag` and invalidate them when a run finishes.
- Charts load as client components (`dynamic(..., { ssr: false })`) behind skeletons, with an empty state for "no data yet — run a check".
- Use one `formatPrice`/`formatDate` helper (pt-PT, EUR) in axes, tooltips and tables.
- Tests: unit-test the data transforms (step series, lowest-price band, build totals, downsampling), and add Playwright checks that the chart renders and its tooltip appears, in both themes, at mobile and desktop widths.

## UI quality bar
- Use the shadcn defaults, refined: a neutral palette with one accent, generous spacing, Inter or Geist font, and subtle motion. Respect `prefers-reduced-motion`.
- Dark/light/system toggle in the header. Charts and tables must look right in both themes.
- Responsive at 360 px, 768 px and 1280 px+. No horizontal page scroll; wide tables scroll inside their own container.
- Accessible: keyboard navigable, visible focus, AA contrast, labelled controls.
- Loading skeletons, empty states, and toast feedback (sonner) for actions.
- Format numbers in `pt-PT` (`1 234,56 €`); keep the UI copy in English unless told otherwise.

## Repo, GitHub & workflow
- Monorepo with pnpm workspaces: `apps/web`, `packages/db` (schema + client), `packages/scraper`, `packages/core` (parsing/matching, pure functions).
- Create the GitHub repo with `gh repo create` (ask the user public or private first), and push `main`.
- **Work in feature branches, one PR per milestone**, with conventional commits. Each PR runs CI (GitHub Actions: lint, typecheck, Vitest, build).
- **Auto-merge**: GitHub doesn't let you approve your own PR. Instead, enable "Allow auto-merge" on the repo and run `gh pr merge --auto --squash` on each PR so it merges when CI passes. If the user wants an approval step, add a workflow that approves with `GITHUB_TOKEN` only for PRs authored by the user. Ask before setting up anything that weakens branch protection.
- Vercel: link the repo (`vercel link`/dashboard), with preview deployments per PR and production on `main`. Document every env var in `.env.example`: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `GH_DISPATCH_TOKEN`, `GH_REPO`.
- Never commit secrets. Set them with `gh secret set` / `vercel env add`, and ask the user to paste tokens into those commands themselves.

## Milestones (one PR each; stop and summarize after each)
1. **Scaffold**: monorepo, Next.js, Tailwind, shadcn, theming, layout shell, CI workflow, README.
2. **DB**: Drizzle schema, migrations, Turso + local SQLite, seed, `import-legacy.ts` run against `pc_tracker.json`.
3. **Core matching**: `docs/matching.md` design note (wait for my OK), then the new scored engine in `packages/core`, with Vitest fixtures from real saved pages, including the known failures above.
4. **Scraper**: Playwright runner, throttling, FX, writes to DB, plus the cron and dispatch workflows.
5. **Auth & admin**:
   - **Auth:** Better Auth (OAuth + magic link), roles, invites, signup mode, and a route/action guard helper with tests that prove a `user` can't reach admin actions.
   - **Admin area:** users, merchants with the adapter editor and "Test merchant", catalog, review queue, audit log.
6. **User features**: builds, adding products with catalog dedupe, PCPartPicker import, per-user merchant selection, rate-limited "Check now", wrong-match reports, shared build links.
7. **Views & charts**: dashboard, comparison grid with heatmap, product detail and build pages with every chart and interaction in "Interactive charts", admin merchant-health charts, run logs.
8. **Polish & deploy**: responsive/a11y pass, Playwright smoke tests, Vercel production deploy, free-tier budget doc.

## How to work: models, agents, efficiency
Use the cheapest model that does each job well, keep the context small, and parallelize independent work.

**Who does what**
| Work | Model / agent | Notes |
|---|---|---|
| Orchestration, architecture, `docs/matching.md`, the scoring engine, auth/permission design, merging subagent output | **Opus 5.5** (main session) | the decisions that are expensive to get wrong |
| Read-only sweeps: reading the legacy app, finding usages, checking library docs/APIs, triaging scrape logs | **`Explore` subagent on Haiku 5.5** | ask for conclusions, not file dumps |
| Planning a milestone into file-level steps | **`Plan` subagent on Opus 5.5** | only for milestones 3–6 |
| Well-specified implementation: shadcn pages and forms, CRUD Server Actions, Drizzle queries, chart components, merchant adapters from a written spec | **`general-purpose` subagent on Sonnet 5.5** | give it the exact files, types and acceptance checks |
| Mechanical work: capturing and trimming HTML fixtures, writing fixture tests from a table, lint/type fixes, README/env docs | **Haiku 5.5 subagent** | |
| Review before each PR merges | `/code-review` at `medium` (`high` for milestones 3 and 5) | |
| Security pass on auth, roles, Server Actions and the dispatch token | `/security-review` in milestone 5 | |

**Skills to use**
- `dataviz` before any chart code.
- `run` to launch the app and verify changes in the browser.
- `fewer-permission-prompts` after milestone 1.
- `init` to write a `CLAUDE.md` holding stack, commands, conventions and the milestone checklist, so later sessions start with context instead of rediscovering it.

**Efficiency rules**
- **One session per milestone.** Start fresh from `CLAUDE.md` + this prompt rather than carrying a long history. Update `CLAUDE.md` at the end of each milestone (what exists, what's next, decisions made).
- **Parallelize** independent work with separate sessions in their own git worktrees once the DB schema (milestone 2) has merged:
  - core matching (3) || scraper workflow plumbing (4, using stub matchers)
  - admin UI (5) || chart components (7, built against seeded data)

  Never let two writers touch the same files.
- Batch independent tool calls in one message. Don't re-read files you just wrote. Read large files by range or with grep.
- Hand a subagent a **self-contained brief**: goal, files to touch, interfaces, and how to verify. Then review its diff yourself before committing.
- Specs first for anything with many cases (rejection rules, adapters, chart transforms): write the table of cases, have a cheaper model generate tests from it, then implement until they pass.
- Run checks narrowly while iterating (single test file, `tsc --noEmit` on the package) and the full CI suite only before the PR.

**Optional: an LLM inside the app** (off by default, because the Claude API isn't free)
- **Where:** a `MATCH_JUDGE` setting can send only *medium-confidence* candidates from the review queue to **Haiku 5.5**. It returns a structured verdict (same product? yes/no/unsure, with a reason) that is shown to the admin. It never auto-approves.
- **Limits:** a hard monthly spend cap in `app_settings`, prompt caching on the fixed instructions, and results cached per (product, URL).
- **Without it:** everything works with it disabled.

## Working rules
- Ask me before: making the repo public/private, spending money, changing branch protection, or adding any paid service.
- Prefer the free and generous option. When a free tier has a limit that matters (Actions minutes, Turso row reads, Vercel function duration), name it.
- Verify as you go: run the tests, run the app (`pnpm dev`), and look at pages in the browser in both themes at mobile and desktop widths before calling a milestone done.
- Report honestly. For each merchant, say whether scraping works, is blocked, or is untested, using a real run against the 8 components in `pc_tracker.json`.
