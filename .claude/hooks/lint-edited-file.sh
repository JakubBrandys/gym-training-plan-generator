#!/usr/bin/env bash
# PostToolUse (Write|Edit): oxlint the edited file with its package's own config.
# Exit 2 + stderr is the only combination Claude sees.
HOOK_NAME=lint-edited-file.sh
. "${BASH_SOURCE[0]%/*}/edit-context.sh" || exit 2

LINT=(npx --no-install oxlint)
[ "$PKG" = backend ] && LINT+=(--type-aware)

if ! OUTPUT=$("${LINT[@]}" "$REL" 2>&1 </dev/null); then
  echo "oxlint reported errors in $PKG/$REL:" >&2
  echo "$OUTPUT" >&2
  exit 2
fi
exit 0
