#!/usr/bin/env bash
# Stop: sweep everything this turn changed before the agent finishes, one retry.
export NO_COLOR=1 FORCE_COLOR=0
command -v jq >/dev/null || { echo "Hook end-of-turn.sh needs jq: install it or port the hook to Node." >&2; exit 2; }

INPUT=$(cat)

ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
LOOPS=$(printf '%s' "$INPUT" | jq -r '.loop_count // 0' 2>/dev/null)
if [ "$ACTIVE" = "true" ] || [ "${LOOPS:-0}" != "0" ]; then
  exit 0
fi

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-')
REGISTRY="${TMPDIR:-/tmp}/claude-hooks/${SID:-none}.roots"
ROOTS=()
while IFS= read -r r; do
  [ -n "$r" ] && [ -d "$r" ] && ROOTS+=("$r")
done <<EOF2
$({ git -C "${CWD:-$PWD}" rev-parse --show-toplevel 2>/dev/null; [ -n "$SID" ] && cat "$REGISTRY" 2>/dev/null; } | sort -u)
EOF2
if [ "${#ROOTS[@]}" -eq 0 ]; then
  jq -cn --arg m "end-of-turn.sh: no git checkout at ${CWD:-$PWD}, nothing checked." '{systemMessage: $m}'
  exit 0
fi

REPORT=""

run() {
  local title=$1 root=$2
  shift 2
  local out
  out=$("$@" 2>&1 </dev/null) && return 0
  REPORT="$REPORT
$title ($root):
$(printf '%s\n' "$out" | head -n 120)
"
}

for ROOT in "${ROOTS[@]}"; do
  cd "$ROOT" || continue

  CHANGED=$({ git diff --name-only HEAD; git ls-files -o --exclude-standard; } 2>/dev/null | sort -u)
  [ -n "$CHANGED" ] || continue

  if [ -z "$AGENT_HOOKS_TEST" ] && printf '%s\n' "$CHANGED" | grep -q -E '^\.claude/(hooks/|settings\.json$)'; then
    run "Hook proof test fails" "$ROOT" env AGENT_HOOKS_TEST=1 node --test .claude/hooks/agent-hooks.test.mjs
  fi

  for PKG in backend frontend; do
    printf '%s\n' "$CHANGED" | grep -v -E '\.md$' | grep -q "^$PKG/" || continue
    [ -d "$ROOT/$PKG" ] || continue

    FILES=()
    while IFS= read -r f; do
      case "$f" in
        "$PKG"/*.ts|"$PKG"/*.tsx|"$PKG"/*.mts|"$PKG"/*.cts|"$PKG"/*.js|"$PKG"/*.jsx|"$PKG"/*.mjs|"$PKG"/*.cjs)
          [ -f "$f" ] && FILES+=("${f#"$PKG"/}") ;;
      esac
    done <<EOF3
$CHANGED
EOF3

    cd "$ROOT/$PKG" || continue
    if [ "$PKG" = backend ]; then
      LINT=(npx --no-install oxlint --type-aware)
      TYPECHECK=(npx --no-install tsc --noEmit --pretty false)
    else
      LINT=(npx --no-install oxlint)
      TYPECHECK=(npx --no-install tsc -b --pretty false)
    fi

    [ "${#FILES[@]}" -gt 0 ] && run "oxlint errors in changed $PKG files" "$ROOT" "${LINT[@]}" "${FILES[@]}"
    run "$PKG unit tests fail" "$ROOT" npx --no-install vitest run
    [ "$PKG" = backend ] && run "backend e2e tests fail" "$ROOT" npx --no-install vitest run --config ./vitest.config.e2e.ts
    run "$PKG typecheck fails" "$ROOT" "${TYPECHECK[@]}"
    cd "$ROOT" || continue
  done
done

if [ -n "$REPORT" ]; then
  echo "Fix these before you finish:$REPORT" >&2
  exit 2
fi
[ -n "$SID" ] && [ -f "$REGISTRY" ] && : >"$REGISTRY"
exit 0
