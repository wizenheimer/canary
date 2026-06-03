#!/usr/bin/env bash
# Guided release cutter for canary.
#
# Bumps every workspace package.json (+ the Claude plugin manifests) in lockstep
# via scripts/sync-version.mjs, refreshes the lockfile, validates the build and
# the npm packaging (dry-run), then creates the release commit and the vX.Y.Z
# tag — and STOPS. Pushing the tag is deliberately left to you, because that push
# is what triggers .github/workflows/release.yml and publishes to npm:
#
#   make release                  # interactive: pick patch / minor / major
#   make release BUMP=minor        # non-interactive bump
#   make release VERSION=1.4.0      # set an explicit version
#
# Env knobs:
#   YES=1         skip the final confirmation prompt
#   NO_VERIFY=1   skip the local build + publish dry-run (faster, less safe)
#   ALLOW_DIRTY=1 escape hatch — proceed on a dirty tree (discouraged)
set -euo pipefail

# --- presentation -----------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
  YLW=$'\033[33m'; CYN=$'\033[36m'; RST=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GRN=''; YLW=''; CYN=''; RST=''
fi
info() { printf '%s\n' "${CYN}▸${RST} $*"; }
ok()   { printf '%s\n' "${GRN}✓${RST} $*"; }
warn() { printf '%s\n' "${YLW}!${RST} $*" >&2; }
die()  { printf '%s\n' "${RED}✗ $*${RST}" >&2; exit 1; }

# Run from the repo root regardless of where make/the user invoked us.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

YES="${YES:-}"; NO_VERIFY="${NO_VERIFY:-}"; ALLOW_DIRTY="${ALLOW_DIRTY:-}"
BUMP="${BUMP:-}"; VERSION="${VERSION:-}"

# Read interactive answers from the terminal even when stdin is a pipe (make).
# Prefer /dev/tty; if it isn't truly usable, fall back to stdin; on EOF the reply
# stays empty so the caller treats it as "no" and aborts safely.
ask() {
  local prompt="$1" reply=''
  if { exec 3</dev/tty; } 2>/dev/null; then
    read -r -p "$prompt" reply <&3 || true
    exec 3<&-
  else
    read -r -p "$prompt" reply 2>/dev/null || true
  fi
  printf '%s' "$reply"
}

# --- preconditions ----------------------------------------------------------
command -v git  >/dev/null || die "git not found on PATH"
command -v node >/dev/null || die "node not found on PATH"
command -v pnpm >/dev/null || die "pnpm not found on PATH"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  warn "You are on '${BRANCH}', not 'main'. Releases normally cut from main."
  [ "$(ask "Continue on '${BRANCH}'? [y/N] ")" = "y" ] || die "Aborted."
fi

if [ -z "$ALLOW_DIRTY" ] && ! { git diff --quiet && git diff --cached --quiet; }; then
  git status --short
  die "Working tree is not clean. Commit or stash first (or set ALLOW_DIRTY=1)."
fi

# Make sure we are not tagging a stale commit.
info "Fetching from origin…"
git fetch --quiet --tags origin || warn "git fetch failed — continuing with local refs."
if UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  BEHIND="$(git rev-list --count "HEAD..${UPSTREAM}" 2>/dev/null || echo 0)"
  [ "$BEHIND" = "0" ] || die "Local ${BRANCH} is ${BEHIND} commit(s) behind ${UPSTREAM}. Pull first."
fi

# --- choose the new version -------------------------------------------------
CURRENT="$(node -p "require('${ROOT}/package.json').version")"
info "Current version: ${BOLD}${CURRENT}${RST}"

bump() { # <current> <patch|minor|major>
  local core="${1%%-*}"; core="${core%%+*}"
  local MA MI PA; IFS=. read -r MA MI PA <<< "$core"
  case "$2" in
    major) echo "$((MA + 1)).0.0" ;;
    minor) echo "${MA}.$((MI + 1)).0" ;;
    patch) echo "${MA}.${MI}.$((PA + 1))" ;;
    *) return 1 ;;
  esac
}

NEW=""
if [ -n "$VERSION" ]; then
  NEW="$VERSION"
elif [ -n "$BUMP" ]; then
  NEW="$(bump "$CURRENT" "$BUMP")" || die "BUMP must be patch, minor, or major (got '${BUMP}')."
elif [ -r /dev/tty ]; then
  printf '\nSelect the bump:\n'
  printf '  %s1%s) patch  → %s\n' "$BOLD" "$RST" "$(bump "$CURRENT" patch)"
  printf '  %s2%s) minor  → %s\n' "$BOLD" "$RST" "$(bump "$CURRENT" minor)"
  printf '  %s3%s) major  → %s\n' "$BOLD" "$RST" "$(bump "$CURRENT" major)"
  printf '  %s4%s) custom (type a version)\n' "$BOLD" "$RST"
  case "$(ask "Choice [1-4]: ")" in
    1) NEW="$(bump "$CURRENT" patch)" ;;
    2) NEW="$(bump "$CURRENT" minor)" ;;
    3) NEW="$(bump "$CURRENT" major)" ;;
    4) NEW="$(ask "New version (x.y.z): ")" ;;
    *) die "Invalid choice." ;;
  esac
else
  die "No TTY for the interactive prompt — pass BUMP=<patch|minor|major> or VERSION=x.y.z."
fi

[[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]] \
  || die "'${NEW}' is not a valid semver."
[ "$NEW" != "$CURRENT" ] || die "New version equals current (${CURRENT}); nothing to bump."
TAG="v${NEW}"
git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null && die "Tag ${TAG} already exists."

# --- plan + confirm ---------------------------------------------------------
printf '\n%sRelease plan%s\n' "$BOLD" "$RST"
printf '  %s → %s%s%s   (tag %s%s%s, branch %s)\n\n' \
  "$CURRENT" "$GRN" "$NEW" "$RST" "$BOLD" "$TAG" "$RST" "$BRANCH"
printf '  1. sync-version → write %s across every package.json + plugin manifests\n' "$NEW"
printf '  2. pnpm install (refresh lockfile)\n'
if [ -z "$NO_VERIFY" ]; then
  printf '  3. pnpm build + publish dry-run (validate packaging)\n'
fi
printf '  4. commit  "chore(release): %s"\n' "$TAG"
printf '  5. tag     %s (annotated)\n' "$TAG"
printf '  %s→ then YOU run: git push origin %s --follow-tags%s\n\n' "$DIM" "$BRANCH" "$RST"

if [ -z "$YES" ]; then
  [ "$(ask "Proceed? [y/N] ")" = "y" ] || die "Aborted — no changes made."
fi

# --- execute ----------------------------------------------------------------
info "Writing version ${NEW}…"
node "${ROOT}/scripts/sync-version.mjs" "$NEW"

info "Refreshing lockfile…"
pnpm install

if [ -z "$NO_VERIFY" ]; then
  info "Building (topological)…"
  pnpm build
  info "Validating npm packaging (dry-run)…"
  pnpm -r publish --access public --no-git-checks --dry-run >/dev/null
  ok "Build + packaging validated."
fi

info "Committing…"
git add -A
git commit -m "chore(release): ${TAG}"

info "Tagging ${TAG}…"
git tag -a "$TAG" -m "$TAG"
ok "Release ${BOLD}${TAG}${RST}${GRN} committed and tagged.${RST}"

# --- npm token preflight (the usual gotcha) ---------------------------------
if command -v gh >/dev/null 2>&1; then
  if gh secret list 2>/dev/null | grep -q '^NPM_TOKEN'; then
    ok "Repo secret NPM_TOKEN is set — the Release workflow can publish."
  else
    warn "Repo secret NPM_TOKEN is NOT set. The Release workflow will build but"
    warn "  fail at the publish step (401). Run 'gh secret set NPM_TOKEN' before pushing."
  fi
else
  warn "gh CLI not found — can't verify the NPM_TOKEN repo secret. Ensure it exists."
fi

# --- hand off the push ------------------------------------------------------
printf '\n%sNext — this is the publish trigger, so it is yours to run:%s\n' "$BOLD" "$RST"
printf '  %sgit push origin %s --follow-tags%s\n\n' "$GRN" "$BRANCH" "$RST"
printf '%sTo undo before pushing:%s git tag -d %s && git reset --hard HEAD~1\n' "$DIM" "$RST" "$TAG"
