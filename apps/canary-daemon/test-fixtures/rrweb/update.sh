#!/usr/bin/env bash
# Refresh the vendored rrweb-record bundle used by the daemon's --inject-script
# integration test. Edit VERSION, then run this script. Manual — never CI.
set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(cat VERSION | tr -d '[:space:]')   # e.g. "rrweb@2.0.0-alpha.4"
if [[ ! "$VERSION" =~ ^rrweb@ ]]; then
  echo "VERSION must start with 'rrweb@', got: $VERSION" >&2
  exit 1
fi

URL="https://cdn.jsdelivr.net/npm/${VERSION}/dist/record/rrweb-record.min.js"
echo "Fetching $URL"
curl -fsSL "$URL" -o rrweb-record.min.js
echo "Wrote $(wc -c < rrweb-record.min.js) bytes to rrweb-record.min.js"
