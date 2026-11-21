#!/usr/bin/env bash
# PostToolUse (Write|Edit): run the unit tests that depend on the edited file.
HOOK_NAME=related-tests.sh
. "${BASH_SOURCE[0]%/*}/edit-context.sh" || exit 2

if ! OUTPUT=$(npx --no-install vitest related "$REL" --run 2>&1 </dev/null); then
  echo "Tests related to $PKG/$REL fail:" >&2
  echo "$OUTPUT" | head -n 120 >&2
  exit 2
fi
exit 0
