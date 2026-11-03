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

/*
 * Better Auth tables (user, session, account, verification) are generated in milestone 5.
 * Until then every user reference (`userId`, `createdBy`, `invitedBy`, `actorUserId`) is a
 * plain text column.
 * TODO(milestone 5): add foreign keys from those columns to `user.id`.
 */

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
export const merchantHealth = ["ok", "degraded", "blocked"] as const;
export const identifierKinds = ["gtin", "mpn", "asin"] as const;
export const identifierSources = ["user", "learned"] as const;
export const candidateStatuses = ["pending", "approved", "rejected"] as const;
export const scrapeStatuses = ["ok", "out_of_stock", "not_found", "blocked", "error"] as const;
export const runTriggers = ["cron", "manual"] as const;
export const runStatuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type ScrapeStatus = (typeof scrapeStatuses)[number];

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
    invitedBy: text("invited_by").notNull(), // TODO(milestone 5): FK → user.id
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
    actorUserId: text("actor_user_id"), // TODO(milestone 5): FK → user.id
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
  /** "Sold by the shop" rule (e.g. Worten marketplace filter). */
  sellerRule?: { mustContain?: string; urlParam?: string };
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
    createdBy: text("created_by"), // TODO(milestone 5): FK → user.id
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
    userId: text("user_id").notNull(), // TODO(milestone 5): FK → user.id
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
    userId: text("user_id").notNull(), // TODO(milestone 5): FK → user.id
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
    requestedBy: text("requested_by"), // TODO(milestone 5): FK → user.id
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
    signals: text("signals", { mode: "json" }).$type<Record<string, unknown>>(),
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
