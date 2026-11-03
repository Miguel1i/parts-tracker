# Parts Tracker

Track PC part prices across the shops PCPartPicker doesn't cover (mostly Portuguese, Spanish, French and UK merchants). Prices are scraped on a schedule or on demand, every observation is kept, and history is shown in interactive charts.

> Status: **milestone 1 — app shell**. The full plan is in [docs/BUILD_PROMPT.md](docs/BUILD_PROMPT.md).

## Stack

| Layer    | Choice                                                                            |
| -------- | --------------------------------------------------------------------------------- |
| App      | Next.js 16 (App Router, Cache Components) + TypeScript, deployed on Vercel        |
| UI       | Tailwind CSS v4, shadcn/ui (Radix), lucide icons, next-themes (light/dark/system) |
| i18n     | next-intl — English at `/`, Portuguese at `/pt`                                   |
| Database | Turso (libSQL) + Drizzle ORM _(milestone 2)_                                      |
| Scraper  | Playwright in GitHub Actions _(milestone 4)_                                      |
| Auth     | Better Auth with roles and admin approval _(milestone 5)_                         |
| Tests    | Vitest                                                                            |

## Layout

```
apps/web          Next.js app
packages/core     pure parsing & matching logic (no I/O)
docs/             build prompt and design notes
```

## Develop

Requires Node 22+ and pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

| Command          | What it does                                                |
| ---------------- | ----------------------------------------------------------- |
| `pnpm lint`      | ESLint                                                      |
| `pnpm typecheck` | Next route types + `tsc` in every package                   |
| `pnpm test`      | Vitest in every package (includes a translation-keys check) |
| `pnpm format`    | Prettier                                                    |
| `pnpm build`     | Production build of the web app                             |

## Translations

All UI text lives in `apps/web/messages/<locale>.json`; `en.json` is the source of truth and keys are type-checked. To add a language, add a JSON file with the same keys and register the locale in `apps/web/src/i18n/routing.ts`. A test fails if any locale is missing keys.

## Deploy (Vercel)

Import the GitHub repo in Vercel and set **Root Directory** to `apps/web` (Vercel detects pnpm workspaces). Environment variables are listed in [.env.example](.env.example).

## Free-tier budget

To be filled in as services are added (Vercel Hobby, Turso, GitHub Actions — this repo is public, so Actions minutes are unlimited).
