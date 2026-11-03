# Matching engine — design note (milestone 3)

Status: **draft, awaiting owner approval.** No engine code is written until this is OK'd.

This note describes the scored-rules engine in `packages/core`. It decides, for a reference
product and a candidate offer seen at a merchant, whether the offer is the same product:
**accept**, **review** or **reject**, with a breakdown that explains why. It replaces the
boolean `verify()` chain in the old `pc_price_tracker.py`; the Python file was used only as a
list of requirements and lessons (see "Lessons from the old app" at the end).

## 1. Scope and boundaries

`packages/core` stays pure: no network, no DB, no clock (the caller passes `now`). It owns:

| Module             | Does                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `normalize/`       | text folding (accents, `™`, `®`, case), tokenizing, model-token detection, GTIN/MPN/ASIN normalization |
| `attributes/`      | parses capacity, wattage, memory layout/speed/CL, colour, connectivity, packaging, tier… from a title  |
| `extract/`         | HTML string → `Offer` (product page) or `Offer[]` + links (search/listing page)                        |
| `rules/`           | one file per rule (A1–A16, B1–B15), each returning a `RuleResult`                                      |
| `score.ts`         | runs the rules, sums contributions, applies vetoes and thresholds → `MatchDecision`                    |
| `lexicon/words.ts` | the single multilingual word list (PT/ES/FR/EN/IT/DE)                                                  |

The scraper (milestone 4) fetches pages, calls `extract*` and `matchOffer`, and writes the DB.
HTML parsing uses **cheerio** (pure JS, works in Node, Vercel functions and Vitest). It is the
only new runtime dependency of `@parts/core`.

### Main types

```ts
type Category =
  | "cpu"
  | "gpu"
  | "motherboard"
  | "ram"
  | "ssd"
  | "hdd"
  | "psu"
  | "case"
  | "cooler"
  | "fan"
  | "monitor"
  | "other"; // products.category text is mapped onto this

interface MatchTarget {
  // built by the caller from products + product_identifiers + history
  name: string;
  query: string;
  brand?: string;
  category: Category;
  refPrice?: number; // EUR
  recentPrices: number[]; // EUR, accepted price_points of the last 30 days, all merchants
  identifiers: {
    kind: "gtin" | "mpn" | "asin";
    value: string;
    source: "user" | "learned";
    confirmed: boolean;
    confidence: number;
  }[];
  spec: MatchSpec; // products.match_spec (see §8), defaults = {}
}

interface Offer {
  // what extract/ produces, the same shape for every source
  url: string;
  canonicalUrl: string;
  stage: "link" | "listing" | "page";
  title?: string;
  titleSource?: "jsonld" | "selector" | "microdata" | "og" | "h1" | "link";
  brand?: string;
  gtins: string[];
  mpn?: string;
  sku?: string;
  asin?: string;
  price?: { value: number; currency: string; eur: number; source: string; raw: string };
  condition?: "new" | "refurbished" | "used" | "damaged";
  stock: "in_stock" | "out_of_stock" | "preorder" | "unknown";
  seller?: { name?: string; own: boolean | "unknown"; evidence: string };
  categoryHints: string[]; // breadcrumbs, JSON-LD category, URL path segments
  pageKind: "product" | "listing" | "unknown";
}

interface RuleResult {
  rule: string; // "A6-barcode", "B3-cpu-suffix", …
  verdict: "veto" | "penalty" | "boost" | "pass";
  weight: number; // points added (boost +, penalty −, 0 for pass/veto)
  evidence: string; // human text, i18n'd in the UI from rule + params
  params?: Record<string, string | number>;
}

interface MatchDecision {
  decision: "accept" | "review" | "reject";
  score: number; // 0–100 after clamping
  results: RuleResult[]; // the full breakdown, stored in match_candidates.signals
  vetoes: string[]; // rule ids that vetoed
}
```

## 2. Pipeline

1. **Link pre-filter** (search page → links, cheap, no fetch): A11 junk links, A8 search/listing
   URLs, A9 (A1–A3 + B1–B7 on link text + slug), A10 link score. Keep the top **5** links by link
   score; log the dropped ones with the rule that dropped them.
2. **Listing offers** (JSON-LD `ItemList`/`Product` nodes or embedded app-state JSON on the
   search page): scored with every rule that only needs title + price. They can be **reviewed**
   but never **auto-accepted** from listing data alone, because seller, condition and identifiers
   are usually missing; an accept needs the product page (stage `page`).
3. **Product page**: full rule set. This is the only stage that can auto-accept.

Search order stays as before: GTIN query, then MPN, then free text. Stop at the first query that
yields an **accept**. Review candidates from all queries are collected; the best one per pair is
written to `match_candidates` (one pending row per pair + canonical URL).

## 3. Signals and weights

The score is a plain sum, starting at 0 and clamped to 0–100. Each group has a cap so one strong
signal can't hide a contradiction elsewhere. Vetoes short-circuit to `reject` regardless of score
but every rule still runs, so the UI can show the whole picture.

| Group          | Signal                                                                      | Points            |
| -------------- | --------------------------------------------------------------------------- | ----------------- |
| **Identifier** | GTIN equal to a `user` or confirmed identifier                              | +45               |
| (cap +45)      | GTIN equal to an unconfirmed `learned` identifier                           | +25               |
|                | MPN equal (normalized, ≥ 6 chars) to user/confirmed                         | +40               |
|                | MPN equal to unconfirmed learned                                            | +20               |
|                | ASIN equal (Amazon only)                                                    | +45               |
|                | Reference GTIN/MPN appears in the page text but not in structured data      | +10 ¹             |
|                | GTIN differs from an unconfirmed learned GTIN, nothing else matches         | −10               |
|                | GTIN differs from an unconfirmed learned GTIN, but MPN/another GTIN matches | 0 ²               |
| **Title**      | weighted token similarity `sim` ∈ [0, 1] (below)                            | `50 × sim`        |
| **Brand**      | brand equal (JSON-LD brand or title)                                        | +5                |
|                | brand differs, CPU/GPU-chip category                                        | −15               |
| **Attributes** | each parsed attribute present on both sides and equal                       | +3 (cap +9)       |
| (B1–B7)        | attribute named by the reference, absent on the candidate                   | −4 each (cap −12) |
| **Price**      | see the price curve below                                                   | +10 … −35         |
| **Seller**     | `ownOnly` merchant, seller unknown                                          | −10               |
| **Other**      | B2 OC vs non-OC, B7 CL differs, B11 regional variant                        | −10 each          |

¹ Only on a product page and only when `sim ≥ 0.4`, because search pages echo the query code.
² The learned GTIN is then suspect: the caller lowers its `confidence` (see §6).

### Title similarity (A7)

Both titles are folded (lower case, accents and `™®©` removed, `9800X 3D` → `9800x3d`, `2 x 16` →
`2x16`) and tokenized. Each **reference** token gets a weight:

| Token class  | Examples                                           | Weight |
| ------------ | -------------------------------------------------- | ------ |
| model token  | `9800x3d`, `b850`, `5070`, `nh-d15s`, `990`        | 3      |
| variant word | `ti`, `super`, `evo`, `plus`, `tomahawk`           | 2      |
| brand        | `amd`, `msi`, `noctua`                             | 2      |
| plain word   | `ryzen`, `trident`, `straight`, `power`            | 1      |
| filler       | `processador`, `gaming`, `cpu`, `memory`, `ddr5` ³ | 0.25   |

`sim = Σ weight(found) / Σ weight(all reference tokens)` against the candidate title (and URL slug
on the link stage). A model token is any token mixing digits and letters, or a ≥ 3-digit number,
that isn't a unit value (`16gb`, `1000w`, `4.7ghz` are attributes, not model tokens). Any missing
model token is a **veto** (A7). Model tokens compare whole: `9800x` ≠ `9800x3d`, `7600` ≠ `7600x`
(B3).

³ Spec words that the attribute parser handles are filler for `sim` so they don't count twice.

### Price curve (A4, B13)

`ref` = `refPrice`, else the median of `recentPrices` (≥ 3 values), else no price signal. With
`r = candidateEur / ref`:

| r                  | Verdict | Points                          |
| ------------------ | ------- | ------------------------------- |
| 0.8 – 1.3          | boost   | +10                             |
| 0.5 – 0.8, 1.3 – 2 | penalty | linear 0 → −20 towards the edge |
| 0.35 – 0.5, 2 – 3  | penalty | linear −20 → −35                |
| < 0.35 or > 3      | veto    | —                               |

B13 runs first, in extraction: an instalment price (`12x de`, `/mês`, `por mes`), a `from €X`/
`desde`/`a partir de` listing price or a price without currency is discarded and the extractor
keeps looking. If nothing is left the result is `not_found` "no price" (A12), not a wrong product.

## 4. Thresholds

| Score (no veto)  | Decision   | Effect                                                                         |
| ---------------- | ---------- | ------------------------------------------------------------------------------ |
| **≥ 70**         | **accept** | price point written, `product_merchant.autoUrl` set                            |
| **45 – 69**      | **review** | `match_candidates` row, status `pending`; pair status `review`; no price point |
| **< 45** or veto | **reject** | logged in the trace only                                                       |

Extra accept guards: stage must be `page`, and either an identifier matched or `sim ≥ 0.9`.

What the numbers mean in practice:

- Identifier + good title + plausible price: 45 + 50 + 5 + 10 = 110 → **100** → accept.
- No identifier on the page, perfect title, brand, price in band, two attributes agree: 50 + 5 +
  10 + 6 = **71** → accept. This is close to the old "all tokens present" rule, but now behind
  every veto in §5 and the price band.
- Same, but one query word missing (`sim ≈ 0.8`): 40 + 5 + 10 = **55** → review.
- Same, but contradicting an unconfirmed learned GTIN: 71 − 10 = **61** → review.
- Perfect title but price 2.1× and seller unknown: 50 + 5 − 21 − 10 = **24** → reject.

The thresholds and weights are constants in `score.ts`, tuned against the fixtures before merge.

## 5. Hard rejection rules

Every rule lives in `packages/core/src/rules/<id>.ts`, has its own test file with at least one
must-reject and one must-accept case, and reads its word lists from `lexicon/words.ts`.

| #   | Rule                       | Veto when                                                                                                                                                      | Otherwise                                                  |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A1  | Refurbished / used         | refurb words in title or URL, or JSON-LD `itemCondition` ≠ `NewCondition`; skipped when `spec.condition = "any"`                                               | pass                                                       |
| A2  | Variant words              | the per-category variant set differs (Ti, Super, XT, XTX, GRE, Plus, Pro, Max, Neo, Ultra, EVO, …), after removing noise (`80 Plus`, `Max Boost`, `boost max`) | pass                                                       |
| A3  | Efficiency tier            | both name an 80 Plus tier or a Cybenetics tier and they differ                                                                                                 | pass                                                       |
| A4  | Price implausible          | r < 0.35 or r > 3                                                                                                                                              | curve above                                                |
| A5  | Prebuilt / laptop / bundle | words (gaming PC, computador, ordenador, ordinateur, portátil, laptop, bundle, kit, combo, pack, PC completo, `+` joining two parts) unless the product is one | pass                                                       |
| A6  | Barcode                    | candidate GTINs and a **user or confirmed** GTIN don't overlap (all normalized to 14 digits, check digit valid)                                                | ±points above; invalid GTINs ignored with a note           |
| A7  | Name too weak              | a model token is missing                                                                                                                                       | `50 × sim`                                                 |
| A8  | Not a product page         | search/listing URL pattern, or page has ≥ 6 product cards and no single `Product` node                                                                         | pass                                                       |
| A9  | Pre-filter on links        | A1–A3 and B1–B7 fire on link text + slug                                                                                                                       | pass                                                       |
| A10 | Low link score             | link `sim < 0.6` or a model token missing (drops the link, not a veto on a page)                                                                               | rank                                                       |
| A11 | Junk link                  | `#`, `javascript:`, `mailto:`, `tel:`, `add-to-cart`, `wishlist`, `admin-ajax`, `/cart`, `/login`                                                              | pass                                                       |
| A12 | No price                   | — (status `not_found`, reason "no price")                                                                                                                      | —                                                          |
| A13 | Seller                     | `ownOnly` and the seller is a third party (seller name as evidence)                                                                                            | unknown → −10                                              |
| A14 | Blocklist                  | canonical URL, external ID (ASIN/SKU) or normalized title is on the pair's (or product's) blocklist                                                            | pass                                                       |
| A15 | Stale auto URL             | — (revalidation: the auto URL is scored like any page; 3 non-accepts in a row drop it)                                                                         | —                                                          |
| A16 | Pinned URL                 | never rejects; rules still run and a would-be reject sets a **warning badge**                                                                                  | —                                                          |
| B1  | Connectivity               | one side has WiFi / BT / `-E` / `-F` suffix and the other doesn't                                                                                              | pass                                                       |
| B2  | GPU sub-model              | product line differs (Ventus vs Gaming Trio vs Suprim; Windforce vs Eagle vs Aorus…)                                                                           | OC vs non-OC → −10                                         |
| B3  | CPU suffix                 | suffix is part of the model token: 9800X ≠ 9800X3D, 7600 ≠ 7600X, 14600K ≠ 14600KF ≠ 14600                                                                     | pass                                                       |
| B4  | Tray / boxed               | `spec.packaging` is `box` and the candidate says tray/OEM/MPK/"sem cooler"/unboxed/without fan, or the reverse                                                 | pass when `any`                                            |
| B5  | Colour / edition           | the reference names a colour/edition and the candidate names a different one (chromax.black vs brown, White, Snow, ARGB vs non-RGB)                            | reference names it, candidate silent → −4 (attribute rule) |
| B6  | Capacity / size            | parsed value + unit differ: TB/GB storage, W, mm radiator, inch                                                                                                | pass                                                       |
| B7  | Memory kit                 | layout (2×16 vs 1×32), total capacity or speed (DDR5-6000 vs 6400) differs                                                                                     | CL differs → −10                                           |
| B8  | Accessory for the part     | the reference model appears after a "for / para / pour / per / für / compatível com / compatible con" phrase                                                   | pass                                                       |
| B9  | Category                   | category hints (breadcrumbs, JSON-LD category, URL path) map to a different `Category`                                                                         | pass when no hints                                         |
| B10 | Multipack                  | "pack 3", "3x", "kit de 2", "3-pack" when `spec.quantity` is 1 (default)                                                                                       | unit price compared when the spec allows packs             |
| B11 | Regional                   | plug type differs (UK/US plug) on a product with a mains cable at a non-UK merchant                                                                            | "import", "US version" → −10                               |
| B12 | Preorder / sold out        | — not a rejection: sets `stock` to `preorder` / `out_of_stock`                                                                                                 | —                                                          |
| B13 | Price sanity               | that price value is discarded (instalment, "from", no currency)                                                                                                | —                                                          |
| B14 | Brand                      | brands differ for motherboard, GPU board, PSU, case, cooler, fan, RAM, SSD                                                                                     | −15 for CPU / chip brand noise                             |
| B15 | Duplicate listing          | — the scraper keeps the cheapest in-stock offer per pair per run; one series in history                                                                        | —                                                          |

Variant vocabularies are per category (GPU: Ti/Super/XT/XTX/GRE; SSD: EVO/Plus/Pro; board: MAX/
Plus/Pro/Elite/WIFI; RAM: Neo/RGB; …), so "Pro" on an SSD and "Pro" in "ProArt" don't clash.

## 6. Learned identifiers and the blocklist

**Learning.** After an **accept** at stage `page`, every valid GTIN/MPN/ASIN found in structured
data is upserted into `product_identifiers` with `source = "learned"`, `confirmed = false`,
`sourceMerchantId`, and recorded as a sighting (§8). A learned value is promoted to
`confirmed = true` when it has been seen on accepted pages at **≥ 2 different merchants** or a user
confirms it in the UI. Learning only happens from accepts with `sim ≥ 0.9`, never from review or
pinned pages, so a single bad page can't teach a code.

**Feedback loop.**

- Unconfirmed learned codes only give the smaller boosts and only cause a −10 penalty on mismatch.
  They never veto.
- When a candidate is accepted through other evidence while contradicting an unconfirmed learned
  GTIN, that learned row's `confidence` drops by 0.5; at ≤ 0 it is deleted. This is how the wrong
  `5606628885125` on the 9800X3D would have cleaned itself up.
- Review-queue **Approve** = pin the URL (`manualUrl`), confirm the identifiers on that page, and
  mark the candidate `approved`. **Reject** = blocklist row (URL + external ID + title) and
  `rejected`.

**Blocklist (A14).** Matched by canonical URL (Amazon → `/dp/ASIN`, others without query/fragment
except an allow-list of meaningful params), by external ID, or by normalized title. A row with
`merchantId = null` applies at every merchant. User "mark wrong" reports create a pending
candidate first; only an admin decision writes the blocklist.

## 7. "Sold by the shop" (A13)

Applies only when `merchants.ownOnly = true`. Seller detection runs in `extract/` and is driven by
`adapterConfig.sellerRule`; the generic default reads "sold by" phrases in 8 languages and JSON-LD
`offers.seller.name`.

```ts
sellerRule?: {
  ownNames: string[];              // names that mean "the shop": ["Worten"], ["Amazon", "Amazon EU S.à r.l."]
  sellerSelector?: string;         // where the seller name is, e.g. "[data-seller-name]"
  thirdPartyMarkers?: string[];    // substrings/selectors proving a marketplace seller:
                                   // Amazon "#sellerProfileTriggerId", Worten "marketplace-seller"
  urlParam?: string;               // search-URL filter param for own-sold offers, if the shop has one
  mustContain?: string;            // kept for compatibility with the current type
}
```

Outcome: seller in `ownNames` → pass; third-party marker or another seller name → **veto** with
evidence "sold by ON4TECH"; nothing found → `own: "unknown"` → −10. Unlike the old app, a page
whose seller couldn't be read is a penalty, not a rejection. This is a TypeScript type change on
the JSON column only, no migration.

## 8. Schema changes (proposed — please confirm)

The current schema covers almost everything. Four small additions, each needed by a rule in the
build prompt:

| Change                                                                                                                                              | Why                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products.match_spec` json, default `{}`: `{ packaging?: "box"\|"tray"\|"any", condition?: "new"\|"any", quantity?: number, allowPacks?: boolean }` | B4 requires packaging as a product field; A1 "unless the product asks for refurbished" and B10 packs need a place too. One json column instead of four. |
| `product_identifiers.sightings` json, default `[]`: `{ merchantId, url, at }[]` (capped at 10)                                                      | The "≥ 2 merchants agree" promotion can't be counted from a single `sourceMerchantId`, and the unique key allows one row per value.                     |
| `product_merchant.auto_url_failures` integer, default 0, and `last_match` json (score, decision, vetoes)                                            | A15 "3 failures in a row" and the A16 pinned-URL warning badge, without scanning `scrape_logs`.                                                         |
| `blocklist.external_id` text (ASIN/SKU), nullable                                                                                                   | A14 blocks by product ID as well as URL and title.                                                                                                      |

Plus one **data fix** found while reading the import: `packages/db/src/legacy.ts` imports learned
GTINs/MPNs with `confirmed: true`. Under the new rules a confirmed GTIN mismatch is a veto, so the
wrong learned `5606628885125` on the 9800X3D would reject the correct offer everywhere. The fix:
import non-typed codes as `confirmed: false`, and a one-off update for the rows already in Turso
(`source = 'learned'` → `confirmed = 0`).

## 9. Fixtures

There are no saved pages yet (the old app's `debug/` folder isn't in the backup), so fixtures are
captured fresh.

**Format.** `packages/core/test/fixtures/<merchant-slug>/<case>.html` plus `<case>.json`:

```json
{ "target": { "name": "AMD Ryzen 7 9800X3D", "category": "cpu", "refPrice": 399.9,
              "identifiers": [...], "spec": { "packaging": "box" } },
  "stage": "page",
  "expect": { "decision": "accept", "title": "Processador AMD Ryzen 7 9800X3D…",
              "price": 456.9, "vetoes": [] } }
```

HTML is **trimmed** by a capture script (`scripts/capture-fixture.ts`, dev-only, outside
`packages/core`): it keeps JSON-LD, embedded app-state JSON, meta tags, the breadcrumb, the title
block, price block and seller block, removes other `<script>`, `<style>`, SVG, comments, nav and
footer, and caps the file at ~150 KB. Pages that block plain fetches (Amazon, Worten, Chipman) can
be saved from a normal browser ("Save page as → HTML only") and trimmed with the same script.

**Must-have cases** (all from `diagnostico.txt`):

| Merchant      | Page                                    | Expect                                                                                                                                               |
| ------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Globaldata    | 9800X3D product page                    | accept (MPN in page; learned 560… GTIN doesn't block it)                                                                                             |
| Globaldata    | search "AMD Ryzen 7 9800X3D"            | links include the CPU; the three "Computador King Mod…" PCs rejected by A5/A4                                                                        |
| PCBem         | 9800X3D boxed page                      | accept; if the page carries the 730… GTIN, review on a cold start (learned 560… conflicts) and accept once 730… is confirmed — tested in both states |
| PCBem         | 9800X3D tray page                       | reject B4 when `packaging = box`; accept when `any`                                                                                                  |
| PCBem         | search page                             | `admin-ajax.php?add-to-cart=` links dropped by A11                                                                                                   |
| Radio Popular | search "AMD Ryzen 7 9800X3D"            | the product link/offer is found (the old parser found 0 of 5,438 links)                                                                              |
| Amazon.es     | B0DKFMSMYK product page                 | title is the real product title, not the "O resumo do produto…" summary block                                                                        |
| Amazon.es     | "Unboxed / Fan-Free / without" listings | reject B4 (box) and price penalty/veto at 852 €                                                                                                      |
| Amazon.co.uk  | `9800X 3D` title                        | the spaced suffix still matches `9800x3d`; B11 not triggered for a CPU                                                                               |
| Worten        | search with ON4TECH marketplace offers  | reject A13 with "ON4TECH" as evidence                                                                                                                |
| PCDiga        | 9800X3D product page                    | accept (control case: the old app got this right)                                                                                                    |

**Per-rule cases** are mostly synthetic title/price pairs in each rule's test file (cheap and
exhaustive), using the 9 imported products: the 5070 Ti vs 5070 / Ventus / non-OC, B850 Tomahawk
MAX WIFI vs non-WiFi, Z5 Neo 2×16 6000 CL30 vs 2×32 / 6400 / CL36, 990 EVO Plus 2 TB vs 1 TB / 990
Pro, NH-D15S chromax.black vs brown, Straight Power 12 1000 W Platinum vs 850 W / Gold, HX1200i vs
HX750 (the existing Worten blocklist entry), and accessory listings "backplate para RTX 5070 Ti".
Where a real page is easy to save, it replaces the synthetic case.

## 10. Lessons from the old app

- `diagnostico.txt` shows a correct 456.90 € Globaldata page and a 499.90 € PCBem page rejected
  with no reason in the log. The pages matched every query token, so the likely culprit is the
  learned `560…` GTIN or a variant false positive, but the old trace can't tell. Every
  `RuleResult` carries evidence so this can't happen again.
- The old variant check vetoed even when the barcode matched ("the code may have been learned
  wrong"). Here, variant vetoes stay, but identifier evidence and variant evidence are both shown.
- Searching by GTIN/MPN at Amazon and Worten returned unrelated products (a children's rug for the
  MPN). Identifier queries are not trusted more than text queries; only identifiers **on the
  candidate page** count.
- Price parsing already handles `1.234,56` (`parsePrice`); extraction adds currency detection so a
  GBP price is never read as EUR.

## Questions for the owner

1. Thresholds **70 / 45** and the weights above, as a starting point to tune against fixtures?
2. The four schema additions in §8 and the `confirmed` data fix?
3. Fixtures: may I capture pages with a plain fetch from this machine, and will you save the
   blocked ones (Amazon.es, Worten) from your browser when I ask?
