#!/usr/bin/env bash
# Sets the production environment variables for the web app on Vercel, then offers to redeploy.
#
#   bash scripts/setup-vercel-env.sh            # interactive
#   bash scripts/setup-vercel-env.sh --dry-run  # show what it would do; changes nothing
#
# Run it from a checkout whose apps/web is linked to Vercel (`vercel link` in apps/web).
# It generates BETTER_AUTH_SECRET, fills in values it can derive, and asks you to paste the rest
# (secrets are read without echoing). Leave an answer empty to skip that variable. Variables that
# already exist on Vercel are kept unless you choose to replace them. Values are passed to the
# Vercel CLI on stdin, never as arguments, and nothing is written to disk.
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
WEB="$ROOT/apps/web"
TARGET=production
REPO_DEFAULT="Miguel1i/parts-tracker"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }

command -v vercel >/dev/null || { echo "The Vercel CLI isn't installed: npm i -g vercel"; exit 1; }
if [[ ! -f "$WEB/.vercel/project.json" ]]; then
  echo "apps/web isn't linked to a Vercel project here. Run: (cd apps/web && vercel link)"
  exit 1
fi

vc() { vercel --cwd "$WEB" "$@"; }

bold "Reading the variables already set on Vercel ($TARGET)…"
EXISTING=" $(vc env ls "$TARGET" 2>/dev/null | awk '/^ +[A-Z][A-Z0-9_]+ /{print $1}' | tr '\n' ' ') "
note "Already set:${EXISTING:- (none)}"

URL_DEFAULT="https://parts-tracker-azure.vercel.app"

declare -A VALUES=()
declare -A SECRET=()
ORDER=()

exists() { [[ "$EXISTING" == *" $1 "* ]]; }

# ask NAME "help text" [secret] [default]
ask() {
  local name=$1 help=$2 secret=${3:-} default=${4:-} value=""
  echo
  bold "$name"
  while IFS= read -r line; do note "$line"; done <<<"$help"
  if exists "$name"; then
    local keep
    read -r -p "  Already set on Vercel. Replace it? [y/N] " keep
    [[ "$keep" =~ ^[Yy] ]] || { note "kept"; return; }
  fi
  if [[ -n "$secret" ]]; then
    read -r -s -p "  Paste the value (hidden; empty = skip): " value
    echo
  else
    read -r -p "  Value${default:+ [$default]} (empty = ${default:+use default}${default:-skip}): " value
    value=${value:-$default}
  fi
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ -z "$value" ]]; then note "skipped"; return; fi
  VALUES[$name]=$value
  [[ -n "$secret" ]] && SECRET[$name]=1
  ORDER+=("$name")
}

bold "Parts Tracker: Vercel environment ($TARGET)"
note "Create the OAuth apps / keys in the browser as each step says, then paste the values here."

# --- generated / derived
if exists BETTER_AUTH_SECRET; then
  echo; bold "BETTER_AUTH_SECRET"; note "already set; kept (replacing it signs everyone out)"
else
  VALUES[BETTER_AUTH_SECRET]=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')
  SECRET[BETTER_AUTH_SECRET]=1
  ORDER+=(BETTER_AUTH_SECRET)
  echo; bold "BETTER_AUTH_SECRET"; note "generated a random 32-byte secret"
fi

ask BETTER_AUTH_URL "Public URL of the site (no trailing slash)." "" "$URL_DEFAULT"
SITE=${VALUES[BETTER_AUTH_URL]:-$URL_DEFAULT}
SITE=${SITE%/}
[[ -n "${VALUES[BETTER_AUTH_URL]:-}" ]] && VALUES[BETTER_AUTH_URL]=$SITE

ask GITHUB_CLIENT_ID "GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
  Homepage URL:      $SITE
  Callback URL:      $SITE/api/auth/callback/github
Copy the Client ID (skip both GitHub values to hide the GitHub button)."
ask GITHUB_CLIENT_SECRET "Same OAuth app → Generate a new client secret." secret

ask GOOGLE_CLIENT_ID "console.cloud.google.com → APIs & Services → Credentials → Create OAuth client ID
(Web application; set up the OAuth consent screen first, External, and publish it)
  Authorized JavaScript origin: $SITE
  Authorized redirect URI:      $SITE/api/auth/callback/google
Copy the Client ID (skip both Google values to hide the Google button)."
ask GOOGLE_CLIENT_SECRET "Same OAuth client → Client secret." secret

ask RESEND_API_KEY "resend.com → API Keys → Create (Sending access). Starts with re_.
Needed in production for magic links and invites." secret
ask EMAIL_FROM "Sender address. Without a verified domain use the default, which only delivers to
the email you signed up to Resend with; with one, e.g. Parts Tracker <noreply@yourdomain.com>." \
  "" "Parts Tracker <onboarding@resend.dev>"

ask GH_DISPATCH_TOKEN "github.com → Settings → Developer settings → Fine-grained tokens → Generate
  Repository access: only $REPO_DEFAULT
  Permissions: Repository → Actions: Read and write
Used by Admin → Merchants → Test merchant. Starts with github_pat_." secret
ask GH_REPO "Repository the scrape workflow lives in." "" "$REPO_DEFAULT"

if ! exists TURSO_DATABASE_URL || ! exists TURSO_AUTH_TOKEN; then
  echo
  bold "Turso"
  note "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are missing on Vercel."
  ENV_LOCAL="$WEB/.env.local"
  if [[ -f "$ENV_LOCAL" ]] && grep -q '^TURSO_DATABASE_URL=libsql://' "$ENV_LOCAL"; then
    read -r -p "  Copy them from apps/web/.env.local? [Y/n] " copy
    if [[ ! "$copy" =~ ^[Nn] ]]; then
      for n in TURSO_DATABASE_URL TURSO_AUTH_TOKEN; do
        exists "$n" && continue
        v=$(grep -m1 "^$n=" "$ENV_LOCAL" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
        [[ -n "$v" ]] && { VALUES[$n]=$v; ORDER+=("$n"); [[ $n == *TOKEN ]] && SECRET[$n]=1; }
      done
    fi
  else
    ask TURSO_DATABASE_URL "turso db show parts-tracker --url"
    ask TURSO_AUTH_TOKEN "turso db tokens create parts-tracker" secret
  fi
fi

echo
if [[ ${#ORDER[@]} -eq 0 ]]; then bold "Nothing to set."; exit 0; fi
bold "Will set on Vercel ($TARGET): ${ORDER[*]}"
if [[ $DRY_RUN -eq 1 ]]; then note "--dry-run: nothing changed."; exit 0; fi
read -r -p "  Go ahead? [Y/n] " go
[[ "$go" =~ ^[Nn] ]] && { note "cancelled; nothing changed"; exit 0; }

for name in "${ORDER[@]}"; do
  kind=--no-sensitive
  [[ -n "${SECRET[$name]:-}" ]] && kind=--sensitive
  # --force replaces an existing value; the value goes in on stdin, never on the command line.
  printf '%s' "${VALUES[$name]}" |
    vc env add "$name" --environment "$TARGET" --force --yes "$kind" >/dev/null
  note "✓ $name"
done

echo
read -r -p "Redeploy production now so the new values take effect? [Y/n] " redeploy
if [[ ! "$redeploy" =~ ^[Nn] ]]; then
  host=${SITE#https://}
  vc redeploy "$host" --environment "$TARGET" ||
    note "Redeploy failed; use Vercel → Deployments → ⋯ → Redeploy, or push to main."
else
  note "Later: Vercel → Deployments → ⋯ → Redeploy, or push to main."
fi
