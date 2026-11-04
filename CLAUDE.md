# CLAUDE.md

Parts Tracker: PC part price tracker. The full spec and milestone plan is `docs/BUILD_PROMPT.md` — read the relevant section before starting a milestone.

## Repo

- pnpm workspace: `apps/web` (Next.js 16), `packages/core` (pure TS, parsing/matching/GTIN; no I/O), `packages/db` (`@parts/db`: Drizzle schema, libSQL client, migrations in `packages/db/drizzle`, seed, legacy import).
- Next.js 16 differs from older versions: read `apps/web/node_modules/next/dist/docs/` before using an API you're unsure of (see `apps/web/AGENTS.md`).
- Windows dev machine: git comes from GitHub Desktop (`%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd`), gh is at `C:\Program Files\GitHub CLI\gh.exe`. When editing JSON from PowerShell, write UTF-8 **without BOM** (a BOM in package.json breaks Next/Tailwind).

## Commands (repo root)

`pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm format` · `pnpm build`. CI runs format check, lint, typecheck, test, build.

DB: `pnpm db:generate` (after editing `packages/db/src/schema.ts`; commit the SQL) · `db:migrate` · `db:seed` (12 legacy merchants) · `db:import-legacy` (reads gitignored `.scratch/pc_tracker.json`; never commit it).

## Conventions

- **Cache Components is on.** Read the locale with `initLocale()` from `@/i18n/server` (uses `next/root-params`), never `await params` for the locale. `[locale]/layout.tsx` is the root layout — don't add `app/layout.tsx`.
- **i18n:** every user-facing string goes in `apps/web/messages/en.json` and `pt-PT.json` (keys typed from en.json; a test checks parity). Use `Link`/`useRouter`/`usePathname` from `@/i18n/navigation`, not `next/link`.
- **Navigation lives only in the sidebar** (`src/lib/nav.ts`). Account menu, theme and language appear in both the sidebar footer and the top bar. **Admin is never in the sidebar** — it's reached from the account menu for admins only, and `/admin` must be guarded server-side.
- UI: shadcn/ui components in `src/components/ui` (ok to adjust), `cn` from `@/lib/utils`. Test in light + dark, at mobile and desktop widths.
- **DB:** `getDb()` from `@parts/db`. Env `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`; a relative `file:` URL resolves to the repo root, so web and scripts share `local.db`. GTINs are stored as 14 digits (`normalizeGtin` from `@parts/core`). `price_points` is append-only. Timestamps are `timestamp_ms` Dates. No auth tables yet: user columns are plain text with `TODO(milestone 5)` FKs, and imported data belongs to `legacy-admin` until milestone 5 reassigns it.
- **Matching** (`docs/matching.md`): `matchOffer`/`prefilterLinks`/`extractProductPage`/`extractSearchPage` from `@parts/core`. One file per rule in `packages/core/src/rules/`, word lists only in `src/lexicon/words.ts`, thresholds in `THRESHOLDS`. Fixtures are trimmed real pages in `packages/core/test/fixtures/` (excluded from Prettier; capture with `pnpm --filter @parts/core fixture:capture`).
- One PR per milestone from a `feat/*` branch; conventional commits; PRs auto-merge (squash) when CI passes.

## Milestones

- [x] 1. Scaffold — monorepo, Next.js, Tailwind, shadcn, theming, sidebar shell, i18n (en, pt-PT), CI
- [x] 2. DB — Drizzle + Turso, schema, migrations, legacy import
- [x] 3. Core matching — scored rules engine + HTML extraction in `packages/core` (design: `docs/matching.md`)
- [ ] 4. Scraper — Playwright runner, GitHub Actions cron + dispatch
- [ ] 5. Auth & admin — Better Auth, roles, approval signup, admin area
- [ ] 6. User features — builds, profile & settings, per-user merchants
- [ ] 7. Views & charts
- [ ] 8. Polish & deploy
