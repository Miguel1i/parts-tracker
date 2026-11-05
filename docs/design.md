# Parts Tracker — visual identity & component spec (redesign)

Goal: the site must look deliberately designed by a human studio, NOT like a default shadcn/AI template.
Avoid: Geist/Inter-only look, grey-on-grey cards with big rounded corners, gradient blobs, emoji, glassmorphism,
"shadow-sm rounded-xl border" everywhere, centered generic hero with three icon cards.

## Concept: "the price tag & the receipt"

Parts Tracker watches PC-part prices. The language borrows from shop price tags, till receipts and
component datasheets: warm paper, black ink, one signal colour, monospaced figures, hairline rules,
perforated/dashed separators used sparingly, square-ish corners (radius 2–6px), tight uppercase labels.

## Type (next/font/google)

- Display + UI: **Schibsted Grotesk** (weights 400/500/600/700/800) — `--font-sans`.
- Figures, prices, codes, labels: **IBM Plex Mono** (400/500/600) — `--font-mono`. All prices, deltas,
  table numbers, KPI values use mono with `font-variant-numeric: tabular-nums`.
- Scale: page title 40/44 (sm: 32), section title 20, body 15/24, small 13, micro labels 11 mono uppercase
  letter-spacing .08em.
- Headings: tight tracking (-0.02em), weight 700/800. No sentence-case title bars in grey.

## Colour tokens (CSS vars, light / dark). Keep the existing token NAMES used by components

(--background, --foreground, --card, --card-foreground, --popover, --popover-foreground, --primary,
--primary-foreground, --secondary, --secondary-foreground, --muted, --muted-foreground, --accent,
--accent-foreground, --destructive, --border, --input, --ring, --sidebar-*) but with these values:

- paper (background): light #F3EFE6 · dark #141311
- surface (card/popover): light #FBF9F4 · dark #1C1A17
- ink (foreground): light #16140F · dark #F1ECE1
- muted text: light #5E584C · dark #A69F90 (AA on paper and surface)
- rule (border/input): light #D8D1C2 · dark #34302A
- muted fill (muted/secondary): light #EAE4D7 · dark #24211D
- signal (primary/ring): light #C03D14 (tag orange-red, AA with paper text) · dark #F0643A; primary-foreground #FFF8F0
- drop/good (success): light #1F6B4F · dark #4FB58A ; rise/bad uses --destructive light #B42318 · dark #F2705E
- accent (hover wash): light #EDE6D6 · dark #2A2621
  Charts keep their validated palette vars (--chart-*); only set --chart-grid to the rule colour.

## Shape & surface

- Radius: --radius: 4px (buttons/inputs 4px, panels 6px, tags 2px). No rounded-xl/2xl anywhere.
- Borders: 1px solid rule. Panels: surface + 1px rule, NO drop shadow (a 1px inner highlight at most).
  Popovers/menus/dialogs: surface + 1px rule + one crisp shadow `0 8px 24px -12px rgb(0 0 0 / .25)`.
- Section separators: full-width 1px rule with a mono micro label sitting on it ("— 02 PRICES").
- Focus: 2px solid signal outline, 2px offset (no blurry rings).

## Components (same export names/props as today's src/components/ui so pages keep working)

- **Button** variants: default = ink fill/paper text (dark: paper fill/ink text); `signal` maybe via
  variant "default"? keep variants default|secondary|outline|ghost|link|destructive and sizes default|sm|lg|icon|icon-sm.
  Height 36 (sm 30, lg 44), radius 4, weight 600, no shadow; hover = slight lift in contrast (not opacity).
  Primary CTA on marketing page uses signal colour (a `className` override or variant "default" on the landing).
- **Input/Textarea/Select trigger**: surface bg, 1px rule, radius 4, height 38, mono placeholder? (no: sans), focus = signal outline.
- **Badge** = "tag": 2px radius, 11px mono uppercase, letter-spacing, variants default (ink), secondary (muted fill),
  outline (rule), destructive, plus success-ish via className. A small notch/hole dot optional for the logo motif only.
- **Card** = "panel": surface, 1px rule, radius 6, padding 20/24; CardTitle 16 semibold; CardDescription muted 14.
- **Table**: no outer rounded box by default; header row = mono 11 uppercase muted with bottom 1px ink rule;
  rows separated by 1px rule; numeric cells right aligned mono.
- **Tabs**: underline tabs (2px signal underline on active), not pill segments.
- **Switch/Checkbox**: square-ish (checkbox radius 2), signal when on.
- **Dialog/AlertDialog/Sheet/Popover/DropdownMenu/Tooltip/Select content**: surface, 1px rule, crisp shadow,
  radius 6; dialog title 20 bold; menu items 14 with mono shortcut slots; tooltip = ink bg/paper text, 12px.
- **Skeleton**: muted fill with a subtle diagonal stripe animation (respect reduced motion).
- **Toaster (sonner)**: receipt-like: surface, 1px rule, left 3px status bar.
- **Avatar**: square-ish (radius 4) initials in mono.

## Brand

- **Logo mark** (SVG, currentColor + signal): a price tag silhouette (rectangle with a cut corner) whose
  punched hole is a square IC pad with two pins — reads as "tag" and "chip". Wordmark "Parts Tracker" in
  Schibsted Grotesk 800 with "Tracker" in signal or a mono "/tracker". Provide <LogoMark/> and <Logo/> in
  src/components/brand/logo.tsx, and app/icon.svg (favicon) + app/apple-icon (png optional).

## Layout / IA (web-designer structure)

- **App shell**: own implementation (no shadcn sidebar). Desktop: fixed left rail 232px with the logo at top,
  numbered nav ("01 Dashboard", "02 Compare", "03 Builds") in mono numerals + sans labels, active item =
  ink bar on the left + bold; footer of rail: account, theme, language. Rail collapses to 64px icon rail
  (state in cookie `rail`). Mobile: top bar with logo + menu button opening a full-height drawer (Radix Dialog).
  Top bar on desktop: breadcrumb/section kicker on the left, theme/language/account on the right
  (CLAUDE.md: account/theme/language appear in both rail footer and top bar; nav only in the rail).
- **Page header** (PageHeader component): mono kicker ("03 — BUILDS"), big title, one-line description,
  actions on the right; a full-width rule under it.
- **Signed-out home**: a real landing page — left-aligned headline with a strong typographic statement,
  a "receipt" style mock showing a part, its shops and the cheapest price (static, real-looking but clearly
  illustrative), three numbered "How it works" steps in a row with rules (not icon cards), CTA buttons
  (Create account / Sign in). No stock illustrations, no gradients.
- Dashboard: KPI strip as a single ruled row of 4 figures (mono values) instead of 4 cards; charts in panels.
- Empty states: short mono kicker + sentence + action; no big icon circles.
- Admin: section nav restyled as a ruled list/underline tabs; Users page gets a dedicated
  "Waiting for approval" panel at the top listing pending accounts with Approve / Reject buttons.
