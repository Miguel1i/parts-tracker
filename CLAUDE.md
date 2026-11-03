# CLAUDE.md

Parts Tracker: PC part price tracker. The full spec and milestone plan is `docs/BUILD_PROMPT.md` — read the relevant section before starting a milestone.

## Repo

- pnpm workspace: `apps/web` (Next.js 16), `packages/core` (pure TS, parsing/matching; no I/O).
- Next.js 16 differs from older versions: read `apps/web/node_modules/next/dist/docs/` before using an API you're unsure of (see `apps/web/AGENTS.md`).
- Windows dev machine: git comes from GitHub Desktop (`%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd`), gh is at `C:\Program Files\GitHub CLI\gh.exe`. When editing JSON from PowerShell, write UTF-8 **without BOM** (a BOM in package.json breaks Next/Tailwind).

## Commands (repo root)

`pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm format` · `pnpm build`. CI runs format check, lint, typecheck, test, build.

## Conventions

- **Cache Components is on.** Read the locale with `initLocale()` from `@/i18n/server` (uses `next/root-params`), never `await params` for the locale. `[locale]/layout.tsx` is the root layout — don't add `app/layout.tsx`.
- **i18n:** every user-facing string goes in `apps/web/messages/en.json` and `pt-PT.json` (keys typed from en.json; a test checks parity). Use `Link`/`useRouter`/`usePathname` from `@/i18n/navigation`, not `next/link`.
- **Navigation lives only in the sidebar** (`src/lib/nav.ts`). Account menu, theme and language appear in both the sidebar footer and the top bar. **Admin is never in the sidebar** — it's reached from the account menu for admins only, and `/admin` must be guarded server-side.
- UI: shadcn/ui components in `src/components/ui` (ok to adjust), `cn` from `@/lib/utils`. Test in light + dark, at mobile and desktop widths.
- One PR per milestone from a `feat/*` branch; conventional commits; PRs auto-merge (squash) when CI passes.

## Milestones

- [x] 1. Scaffold — monorepo, Next.js, Tailwind, shadcn, theming, sidebar shell, i18n (en, pt-PT), CI
- [ ] 2. DB — Drizzle + Turso, schema, migrations, legacy import
- [ ] 3. Core matching — `docs/matching.md` first (needs owner OK), then rules engine + fixtures
- [ ] 4. Scraper — Playwright runner, GitHub Actions cron + dispatch
- [ ] 5. Auth & admin — Better Auth, roles, approval signup, admin area
- [ ] 6. User features — builds, profile & settings, per-user merchants
- [ ] 7. Views & charts
- [ ] 8. Polish & deploy
