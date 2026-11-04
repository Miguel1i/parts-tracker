import type { IdentifierSighting, MatchSpec, RuleResult } from "@parts/core";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** Milliseconds since epoch, exposed as Date. */
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () =>
  timestamp("created_at")
    .notNull()
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`);

// ---------------------------------------------------------------- enums

export const signupModes = ["open", "approval", "invite_only"] as const;
export const roles = ["admin", "user"] as const;
/** `pending` accounts (signup mode `approval`) can sign in but can't use the app until approved. */
export const userStatuses = ["active", "pending"] as const;
export const merchantHealth = ["ok", "degraded", "blocked"] as const;
export const identifierKinds = ["gtin", "mpn", "asin"] as const;
export const identifierSources = ["user", "learned"] as const;
export const candidateStatuses = ["pending", "approved", "rejected"] as const;
export const scrapeStatuses = ["ok", "out_of_stock", "not_found", "blocked", "error"] as const;
export const runTriggers = ["cron", "manual"] as const;
export const runStatuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type ScrapeStatus = (typeof scrapeStatuses)[number];
export type Role = (typeof roles)[number];
export type UserStatus = (typeof userStatuses)[number];
export type SignupMode = (typeof signupModes)[number];

// ---------------------------------------------------------------- auth (Better Auth)

/*
 * Better Auth core tables plus the admin plugin fields (role, banned, banReason, banExpires,
 * session.impersonatedBy). The JS property names are Better Auth's field names; the Drizzle
 * adapter maps them to these snake_case columns. `status` is our additional field.
 */

const updatedAt = () =>
  timestamp("updated_at")
    .notNull()
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
    .$onUpdate(() => new Date());

export const user = sqliteTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role", { enum: roles }).notNull().default("user"),
  status: text("status", { enum: userStatuses }).notNull().default("pending"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: id(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export type User = typeof user.$inferSelect;

// ---------------------------------------------------------------- admin & settings

/** Single-row table (id = 1). */
export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  signupMode: text("signup_mode", { enum: signupModes }).notNull().default("approval"),
  cronIntervalHours: integer("cron_interval_hours").notNull().default(6),
  /** Minimum minutes between manual "Check now" runs per user (admins are exempt). */
  userRunCooldownMinutes: integer("user_run_cooldown_minutes").notNull().default(10),
  /** Pairs checked within this many minutes are skipped by manual runs. */
  recentCheckSkipMinutes: integer("recent_check_skip_minutes").notNull().default(30),
  updatedAt: timestamp("updated_at"),
});

export const invites = sqliteTable(
  "invites",
  {
    id: id(),
    email: text("email").notNull(),
    role: text("role", { enum: roles }).notNull().default("user"),
    token: text("token").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invites_token_uq").on(t.token), index("invites_email_idx").on(t.email)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    diff: text("diff", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------- merchants

/** Per-shop adapter overrides. Everything is optional; milestone 4 defines the defaults. */
export type AdapterConfig = {
  selectors?: {
    item?: string;
    title?: string;
    price?: string;
    url?: string;
    stock?: string;
    image?: string;
  };
  /** JSON/search API endpoint used instead of HTML search, if the shop has one. */
  apiEndpoint?: string;
  /** "Sold by the shop" rule, used when `ownOnly` is set (see docs/matching.md §7). */
  sellerRule?: {
    /** Seller names that mean "the shop itself", e.g. ["Worten"] or ["Amazon", "Amazon EU S.à r.l."]. */
    ownNames?: string[];
    /** CSS selector for the seller name on a product page. */
    sellerSelector?: string;
    /** Substrings of the HTML that prove a marketplace seller (e.g. `sellerProfileTriggerId`). */
    thirdPartyMarkers?: string[];
    /** Search-URL param that filters to own-sold offers, if the shop has one. */
    urlParam?: string;
    mustContain?: string;
  };
  /** Minimum gap between requests to this host, in ms (default 1500). */
  throttleMs?: number;
  /** Max concurrent requests to this host (default 2). */
  maxConcurrency?: number;
  [key: string]: unknown;
};

export const merchants = sqliteTable(
  "merchants",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    country: text("country"),
    baseUrl: text("base_url").notNull(),
    /** Search URL with a `{q}` placeholder. */
    searchTemplate: text("search_template").notNull(),
    currency: text("currency").notNull().default("EUR"),
    shipping: real("shipping").notNull().default(0),
    freeShippingOver: real("free_shipping_over"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    visibleToUsers: integer("visible_to_users", { mode: "boolean" }).notNull().default(true),
    /** Only accept offers sold by the shop itself (not marketplace sellers). */
    ownOnly: integer("own_only", { mode: "boolean" }).notNull().default(false),
    needsBrowser: integer("needs_browser", { mode: "boolean" }).notNull().default(false),
    adapterConfig: text("adapter_config", { mode: "json" })
      .$type<AdapterConfig>()
      .notNull()
      .default(sql`'{}'`),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    color: text("color"),
    lastHealth: text("last_health", { enum: merchantHealth }),
    lastHealthAt: timestamp("last_health_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("merchants_slug_uq").on(t.slug), uniqueIndex("merchants_name_uq").on(t.name)],
);

// ---------------------------------------------------------------- catalog

/** Matching types stored in JSON columns; defined by the engine in @parts/core. */
export type { IdentifierSighting, MatchSpec };

/** Outcome of the last match on a pair, for the pinned-URL warning badge. */
export type LastMatch = {
  score: number;
  decision: "accept" | "review" | "reject";
  vetoes: string[];
  at: number;
};

export const products = sqliteTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    category: text("category"),
    /** Search query sent to merchants. */
    query: text("query").notNull(),
    imageUrl: text("image_url"),
    refUrl: text("ref_url"),
    brand: text("brand"),
    refPrice: real("ref_price"),
    matchSpec: text("match_spec", { mode: "json" })
      .$type<MatchSpec>()
      .notNull()
      .default(sql`'{}'`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("products_name_idx").on(t.name)],
);

export const productIdentifiers = sqliteTable(
  "product_identifiers",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: identifierKinds }).notNull(),
    /** GTINs are stored normalized to 14 digits (see `normalizeGtin` in @parts/core). */
    value: text("value").notNull(),
    source: text("source", { enum: identifierSources }).notNull().default("user"),
    sourceMerchantId: text("source_merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    confidence: real("confidence").notNull().default(1),
    confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
    /** Accepted pages where this value was seen (capped at 10); ≥ 2 merchants promote it. */
    sightings: text("sightings", { mode: "json" })
      .$type<IdentifierSighting[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("product_identifiers_uq").on(t.productId, t.kind, t.value),
    index("product_identifiers_lookup_idx").on(t.kind, t.value),
  ],
);

// ---------------------------------------------------------------- per-user

export const builds = sqliteTable(
  "builds",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("builds_user_idx").on(t.userId)],
);

export const buildItems = sqliteTable(
  "build_items",
  {
    buildId: text("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    boughtAt: timestamp("bought_at"),
    boughtPrice: real("bought_price"),
    boughtMerchantId: text("bought_merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
  },
  (t) => [primaryKey({ columns: [t.buildId, t.productId] })],
);

export const userMerchants = sqliteTable(
  "user_merchants",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.merchantId] })],
);

// ---------------------------------------------------------------- matching & prices

/** Current state of each (product, merchant) pair. */
export const productMerchant = sqliteTable(
  "product_merchant",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    /** URL pinned by a user; always used when set. */
    manualUrl: text("manual_url"),
    /** URL learned from a search match. */
    autoUrl: text("auto_url"),
    /** Consecutive runs where `autoUrl` failed revalidation; dropped at 3. */
    autoUrlFailures: integer("auto_url_failures").notNull().default(0),
    lastMatch: text("last_match", { mode: "json" }).$type<LastMatch>(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastStatus: text("last_status", { enum: scrapeStatuses }),
    lastPriceEur: real("last_price_eur"),
    lastCheckedAt: timestamp("last_checked_at"),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.merchantId] }),
    index("product_merchant_merchant_idx").on(t.merchantId),
  ],
);

/** Offers marked as wrong matches; never matched again for this product (and merchant). */
export const blocklist = sqliteTable(
  "blocklist",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    url: text("url"),
    name: text("name"),
    /** Shop-side product ID (ASIN, SKU). */
    externalId: text("external_id"),
    createdAt: createdAt(),
  },
  (t) => [index("blocklist_pair_idx").on(t.productId, t.merchantId)],
);

export const scrapeRuns = sqliteTable(
  "scrape_runs",
  {
    id: id(),
    trigger: text("trigger", { enum: runTriggers }).notNull(),
    /** What the run covers, e.g. `{ productId }`, `{ merchantId }`, `{ buildId }` or `{}` for all. */
    scope: text("scope", { mode: "json" })
      .$type<{ productId?: string; merchantId?: string; buildId?: string; legacy?: true }>()
      .notNull()
      .default(sql`'{}'`),
    status: text("status", { enum: runStatuses }).notNull().default("queued"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    stats: text("stats", { mode: "json" }).$type<Record<string, number>>(),
    ghRunUrl: text("gh_run_url"),
    createdAt: createdAt(),
  },
  (t) => [index("scrape_runs_created_idx").on(t.createdAt)],
);

/** Append-only price history. Never update or delete rows. */
export const pricePoints = sqliteTable(
  "price_points",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    ts: timestamp("ts").notNull(),
    priceEur: real("price_eur").notNull(),
    /** Price in the shop's currency when it isn't EUR. */
    priceOrig: real("price_orig"),
    currency: text("currency").notNull().default("EUR"),
    shipping: real("shipping"),
    inStock: integer("in_stock", { mode: "boolean" }).notNull().default(true),
    url: text("url"),
    title: text("title"),
    runId: text("run_id").references(() => scrapeRuns.id, { onDelete: "set null" }),
  },
  (t) => [index("price_points_pair_ts_idx").on(t.productId, t.merchantId, t.ts)],
);

/** What the scraper stores on a review candidate (see packages/scraper/src/store.ts). */
export type CandidateSignals = {
  results?: RuleResult[];
  vetoes?: string[];
  similarity?: number;
  stage?: string;
  /** Identifiers read from the candidate page; Approve confirms them (docs/matching.md §6). */
  page?: { gtins: string[]; mpn?: string; asin?: string; sku?: string; brand?: string };
  [key: string]: unknown;
};

export const matchCandidates = sqliteTable(
  "match_candidates",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    priceEur: real("price_eur"),
    score: real("score").notNull(),
    signals: text("signals", { mode: "json" }).$type<CandidateSignals>(),
    status: text("status", { enum: candidateStatuses }).notNull().default("pending"),
    runId: text("run_id").references(() => scrapeRuns.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("match_candidates_status_idx").on(t.status),
    index("match_candidates_pair_idx").on(t.productId, t.merchantId),
  ],
);

export const scrapeLogs = sqliteTable(
  "scrape_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    status: text("status", { enum: scrapeStatuses }).notNull(),
    message: text("message"),
    /** Truncated scraper log for this pair. */
    log: text("log"),
    createdAt: createdAt(),
  },
  (t) => [index("scrape_logs_run_idx").on(t.runId)],
);

export const fxRates = sqliteTable("fx_rates", {
  /** ISO 4217 code; rate = units of this currency per 1 EUR (ECB convention). */
  currency: text("currency").primaryKey(),
  rate: real("rate").notNull(),
  fetchedAt: timestamp("fetched_at").notNull(),
});
