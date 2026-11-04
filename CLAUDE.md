# CLAUDE.md

Parts Tracker: PC part price tracker. The full spec and milestone plan is `docs/BUILD_PROMPT.md` — read the relevant section before starting a milestone.

## Repo

- pnpm workspace: `apps/web` (Next.js 16), `packages/core` (pure TS, parsing/matching/GTIN; no I/O), `packages/db` (`@parts/db`: Drizzle schema, libSQL client, migrations in `packages/db/drizzle`, seed, legacy import), `packages/scraper` (`@parts/scraper`: fetch → Playwright fallback, per-host throttle, pair pipeline, DB writes; run by `.github/workflows/scrape.yml`).
- Next.js 16 differs from older versions: read `apps/web/node_modules/next/dist/docs/` before using an API you're unsure of (see `apps/web/AGENTS.md`).
- Windows dev machine: git comes from GitHub Desktop (`%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd`), gh is at `C:\Program Files\GitHub CLI\gh.exe`. When editing JSON from PowerShell, write UTF-8 **without BOM** (a BOM in package.json breaks Next/Tailwind).

## Commands (repo root)

`pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm format` · `pnpm build`. CI runs format check, lint, typecheck, test, build.

Scraper: `pnpm scrape [--product <id|name>] [--merchant <id|slug|name>] [--no-browser]` (Chromium once: `pnpm --filter @parts/scraper browser:install`).

DB: `pnpm db:generate` (after editing `packages/db/src/schema.ts`; commit the SQL) · `db:migrate` · `db:seed` (12 legacy merchants) · `seed:admin --email <e>` (first admin; takes over legacy data) · `db:import-legacy` (reads gitignored `.scratch/pc_tracker.json`; never commit it).

## Conventions

- **Cache Components is on.** Read the locale with `initLocale()` from `@/i18n/server` (uses `next/root-params`), never `await params` for the locale. `[locale]/layout.tsx` is the root layout — don't add `app/layout.tsx`.
- **i18n:** every user-facing string goes in `apps/web/messages/en.json` and `pt-PT.json` (keys typed from en.json; a test checks parity). Use `Link`/`useRouter`/`usePathname` from `@/i18n/navigation`, not `next/link`.
- **Navigation lives only in the sidebar** (`src/lib/nav.ts`). Account menu, theme and language appear in both the sidebar footer and the top bar. **Admin is never in the sidebar** — it's reached from the account menu for admins only, and `/admin` must be guarded server-side.
- UI: shadcn/ui components in `src/components/ui` (ok to adjust), `cn` from `@/lib/utils`. Test in light + dark, at mobile and desktop widths.
- **DB:** `getDb()` from `@parts/db`. Env `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`; a relative `file:` URL resolves to the repo root, so web and scripts share `local.db`. GTINs are stored as 14 digits (`normalizeGtin` from `@parts/core`). `price_points` is append-only. Timestamps are `timestamp_ms` Dates. Better Auth tables (`user`, `session`, `account`, `verification`) live in the same schema; user columns are FKs to `user.id`. Data imported before an admin exists belongs to a banned `legacy-admin` placeholder user until `seed:admin` reassigns it. In apps, import drizzle helpers (`eq`, `and`, `sql`…) from `@parts/db/orm`, never `drizzle-orm` (better-auth pulls a second copy with incompatible types).
- **Auth** (`apps/web/src/lib/auth/`): Better Auth config in `server.ts`, client hooks in `client.ts`. Server code reads the session with `getSession()` from `guard.ts`; pages use `requireAdmin()`/`requireUser()`; **every admin Server Action is `export const x = adminAction(zodSchema, handler)`** in an `admin/**/actions.ts` that exports nothing else (`admin-guard.test.ts` calls them all as non-admins). Admin changes write `writeAudit` in the same transaction. A page or layout that reads the session at its top level needs `export const instant = false` (Cache Components); admin pages also gate their metadata with `adminMetadata()`. Users have `status` (`active`|`pending`) besides `role`; signup decisions are in `signup.ts`.
- **Matching** (`docs/matching.md`): `matchOffer`/`prefilterLinks`/`extractProductPage`/`extractSearchPage` from `@parts/core`. One file per rule in `packages/core/src/rules/`, word lists only in `src/lexicon/words.ts`, thresholds in `THRESHOLDS`. Fixtures are trimmed real pages in `packages/core/test/fixtures/` (excluded from Prettier; capture with `pnpm --filter @parts/core fixture:capture`).
- **Scraper** (`packages/scraper`): `scrapePair` is pure apart from its `PageFetcher`, so test it with `FakeFetcher` over core fixtures. All network goes through `SmartFetcher` (limits from `clampLimits`: ≥ 1.5 s, ≤ 2 in flight per host). Never add CAPTCHA solving; blocked → status `blocked`. Raw HTML only goes to `debug/` (the Actions artifact), never the DB. Repo is public (owner's choice), so Actions minutes are unlimited.
- One PR per milestone from a `feat/*` branch; conventional commits; PRs auto-merge (squash) when CI passes.

## Milestones

- [x] 1. Scaffold — monorepo, Next.js, Tailwind, shadcn, theming, sidebar shell, i18n (en, pt-PT), CI
- [x] 2. DB — Drizzle + Turso, schema, migrations, legacy import
- [x] 3. Core matching — scored rules engine + HTML extraction in `packages/core` (design: `docs/matching.md`)
- [x] 4. Scraper — Playwright runner, GitHub Actions cron + dispatch
- [x] 5. Auth & admin — Better Auth, roles, approval signup, admin area
- [ ] 6. User features — builds, profile & settings, per-user merchants
- [ ] 7. Views & charts
- [ ] 8. Polish & deploy
