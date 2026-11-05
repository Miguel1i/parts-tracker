#!/usr/bin/env bash
# Pushes the web app's production environment variables to Vercel from a file.
#
#   bash scripts/setup-vercel-env.sh            # 1st run: creates apps/web/.env.vercel to fill in
#                                               # next runs: pushes its non-empty values
#   bash scripts/setup-vercel-env.sh --dry-run  # show what would be pushed; changes nothing
#
# apps/web/.env.vercel is gitignored and isn't read by Next.js. Run this from a checkout where
# apps/web is linked to Vercel (`vercel link` in apps/web). Instead of running it, you can also
# paste the file's contents into Vercel → Settings → Environment Variables (it accepts .env text).
# From PowerShell: & "C:\Program Files\Git\bin\bash.exe" -lc "bash scripts/setup-vercel-env.sh"
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
WEB="$ROOT/apps/web"
FILE="$WEB/.env.vercel"
TARGET=production

# Values that may be read back in the dashboard; everything else is stored as sensitive.
PLAIN=" EMAIL_FROM GH_REPO BETTER_AUTH_URL "

if [[ ! -f "$FILE" ]]; then
  cat >"$FILE" <<'EOF'
# Production environment for Vercel. Fill in, then run: bash scripts/setup-vercel-env.sh
# This file is gitignored and never read by Next.js. Empty values are skipped.
#
# Sign-in is email or username + password; nothing else is needed for it. Not needed here:
# BETTER_AUTH_URL and GH_REPO come from Vercel's own system variables, and TURSO_DATABASE_URL /
# TURSO_AUTH_TOKEN are already set on Vercel.

# --- Required -------------------------------------------------------------------------------
# Random key that signs sessions. Leave it empty and the script generates one (only when Vercel
# doesn't have one yet: changing it later signs everyone out).
BETTER_AUTH_SECRET=

# --- Optional -------------------------------------------------------------------------------
# Email invites. Without these, Admin -> Users shows the invite link for you to send yourself.
# resend.com -> API Keys -> Create (Sending access); the key starts with re_
RESEND_API_KEY=
# The default sender only delivers to your own Resend email; verify a domain in Resend to use
# e.g. Parts Tracker <noreply@yourdomain.com>
EMAIL_FROM=

# "Test merchant" in Admin -> Merchants starts the scrape on GitHub Actions. Without it, the page
# shows a command to run locally instead.
# github.com/settings/personal-access-tokens/new -> Only select repositories: parts-tracker ->
# Repository permissions -> Actions: Read and write. Starts with github_pat_
GH_DISPATCH_TOKEN=
EOF
  echo "Created apps/web/.env.vercel (gitignored). Fill it in, then run this script again."
  exit 0
fi

command -v vercel >/dev/null || { echo "The Vercel CLI isn't installed: npm i -g vercel"; exit 1; }
if [[ ! -f "$WEB/.vercel/project.json" ]]; then
  echo "apps/web isn't linked to a Vercel project here. Run: (cd apps/web && vercel link)"
  exit 1
fi
vc() { vercel --cwd "$WEB" "$@"; }

declare -A VALUES=()
ORDER=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
  [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]] || { echo "Skipping unreadable line: $line"; continue; }
  name=${BASH_REMATCH[1]}
  value=${BASH_REMATCH[2]}
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value=${BASH_REMATCH[1]}; fi
  [[ -z "$value" ]] && continue
  VALUES[$name]=$value
  ORDER+=("$name")
done <"$FILE"

EXISTING=" $(vc env ls "$TARGET" 2>/dev/null | awk '/^ +[A-Z][A-Z0-9_]+ /{print $1}' | tr '\n' ' ') "

if [[ -z "${VALUES[BETTER_AUTH_SECRET]:-}" ]]; then
  if [[ "$EXISTING" == *" BETTER_AUTH_SECRET "* ]]; then
    echo "BETTER_AUTH_SECRET: already on Vercel; kept."
  else
    VALUES[BETTER_AUTH_SECRET]=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')
    ORDER=(BETTER_AUTH_SECRET ${ORDER[@]+"${ORDER[@]}"})
    echo "BETTER_AUTH_SECRET: generated a random value."
  fi
fi
if [[ -n "${VALUES[RESEND_API_KEY]:-}" && -z "${VALUES[EMAIL_FROM]:-}" ]]; then
  echo "Note: EMAIL_FROM is empty, so emails come from onboarding@resend.dev (your own inbox only)."
fi

if [[ ${#ORDER[@]} -eq 0 ]]; then echo "Nothing to push."; exit 0; fi
echo "Will push to Vercel ($TARGET), replacing existing values: ${ORDER[*]}"
if [[ $DRY_RUN -eq 1 ]]; then echo "--dry-run: nothing changed."; exit 0; fi
read -r -p "Go ahead? [Y/n] " go
[[ "$go" =~ ^[Nn] ]] && { echo "Cancelled; nothing changed."; exit 0; }

for name in "${ORDER[@]}"; do
  kind=--sensitive
  [[ "$PLAIN" == *" $name "* ]] && kind=--no-sensitive
  # The value goes in on stdin, never on the command line.
  printf '%s' "${VALUES[$name]}" |
    vc env add "$name" --environment "$TARGET" --force --yes "$kind" >/dev/null
  echo "  ✓ $name"
done

read -r -p "Redeploy production now so the values take effect? [Y/n] " redeploy
if [[ ! "$redeploy" =~ ^[Nn] ]]; then
  vc redeploy parts-tracker-azure.vercel.app --environment "$TARGET" ||
    echo "Redeploy failed; use Vercel -> Deployments -> ... -> Redeploy, or push to main."
else
  echo "Later: Vercel -> Deployments -> ... -> Redeploy, or push to main."
fi
