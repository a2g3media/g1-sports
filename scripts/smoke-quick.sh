#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Running launch gate..."

RAW_OUTPUT=""
if RAW_OUTPUT="$(npm run --silent smoke:routes 2>&1)"; then
  STATUS=0
else
  STATUS=$?
fi

last_line_for_prefix() {
  local prefix="$1"
  printf "%s\n" "$RAW_OUTPUT" | awk -v p="$prefix" 'index($0, p) == 1 { line=$0 } END { if (line) print line }'
}

VERDICT_LINE="$(last_line_for_prefix 'VERDICT:')"
PASS_LINE="$(last_line_for_prefix 'PASS:')"
CONFIG_LINE="$(last_line_for_prefix 'BLOCKED_CONFIG:')"
RATE_LINE="$(last_line_for_prefix 'BLOCKED_RATE_LIMIT:')"
FAIL_LINE="$(last_line_for_prefix 'FAIL:')"

echo ""
echo "=== Quick Launch Check ==="
[[ -n "$VERDICT_LINE" ]] && echo "$VERDICT_LINE"
[[ -n "$PASS_LINE" ]] && echo "$PASS_LINE"
[[ -n "$CONFIG_LINE" ]] && echo "$CONFIG_LINE"
[[ -n "$RATE_LINE" ]] && echo "$RATE_LINE"
[[ -n "$FAIL_LINE" ]] && echo "$FAIL_LINE"

echo ""
echo "Top blockers:"
printf "%s\n" "$RAW_OUTPUT" | awk '/=> BLOCKED_CONFIG|=> BLOCKED_RATE_LIMIT|=> FAIL/' || true

if [[ $STATUS -ne 0 ]]; then
  exit $STATUS
fi
