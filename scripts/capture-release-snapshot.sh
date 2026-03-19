#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_TS="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
OUT_DIR="docs/ops"
OUT_FILE="$OUT_DIR/release-snapshot-$RUN_TS.md"
TMP_DIR="tmp/release-snapshot-$RUN_TS"

mkdir -p "$OUT_DIR" "$TMP_DIR"

SHA="unavailable (not a git repo or git metadata missing)"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  SHA="$(git rev-parse HEAD 2>/dev/null || true)"
  SHA="${SHA:-unavailable (git head missing)}"
fi

BUNDLE_INFO="dist unavailable"
if [[ -d "dist" ]]; then
  shasum -a 256 dist/* >"$TMP_DIR/dist-hash-top-level.txt" 2>/dev/null || true
  BUNDLE_INFO="captured (top-level dist artifact hashes)"
fi

SECRETS_STATUS="unavailable (wrangler auth/scopes may be missing)"
if wrangler secret list >"$TMP_DIR/secret-list.txt" 2>"$TMP_DIR/secret-list.err"; then
  SECRETS_STATUS="captured"
else
  # Keep script non-blocking for local ops snapshots.
  true
fi

{
  echo "# Release Snapshot"
  echo ""
  echo "- Captured at (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Commit SHA/tag: $SHA"
  echo "- Build fingerprint: $BUNDLE_INFO"
  echo "- Cloudflare secret names: $SECRETS_STATUS"
  echo ""
  echo "## Wrangler config (effective source)"
  echo ""
  echo '- `wrangler.json` copied at snapshot time'
  echo ""
  echo "## Artifacts"
  echo ""
  echo "- Dist hash file: \`$TMP_DIR/dist-hash-top-level.txt\`"
  echo "- Secret list output: \`$TMP_DIR/secret-list.txt\`"
  echo "- Secret list errors (if any): \`$TMP_DIR/secret-list.err\`"
  echo "- Wrangler config copy: \`$TMP_DIR/wrangler.json\`"
} >"$OUT_FILE"

cp "wrangler.json" "$TMP_DIR/wrangler.json"

echo "Snapshot written: $OUT_FILE"
