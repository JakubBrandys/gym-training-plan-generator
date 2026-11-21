#!/usr/bin/env bash
# Sourced by the per-edit hooks. Reads the PostToolUse payload and either exits 0
# (nothing to check) or leaves FILE, ROOT, PKG, REL set with the cwd inside the package.
export NO_COLOR=1 FORCE_COLOR=0
command -v jq >/dev/null || { echo "Hook $HOOK_NAME needs jq: install it or port the hook to Node." >&2; exit 2; }

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$FILE" ] || exit 0
case "$FILE" in /*) ;; *) FILE="${CWD:-$PWD}/$FILE" ;; esac

case "$FILE" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

ROOT=$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null) || exit 0
REPO=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
SESSION_REPO=$(git -C "${CWD:-$PWD}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
[ -n "$REPO" ] && [ "$REPO" = "$SESSION_REPO" ] || exit 0

SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-')
if [ -n "$SID" ] && mkdir -p "${TMPDIR:-/tmp}/claude-hooks"; then
  printf '%s\n' "$ROOT" >>"${TMPDIR:-/tmp}/claude-hooks/$SID.roots"
fi

case "$FILE" in
  "$ROOT"/backend/*) PKG=backend ;;
  "$ROOT"/frontend/*) PKG=frontend ;;
  *) exit 0 ;;
esac
REL=${FILE#"$ROOT/$PKG/"}
cd "$ROOT/$PKG" || exit 0
