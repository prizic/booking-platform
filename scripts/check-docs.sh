#!/usr/bin/env bash
# Knowledge-pack gate for issue #1. Run from the repo root: bash scripts/check-docs.sh
# Checks: (1) relative links resolve, (2) spec §1-§34 are all mapped, (3) no secret-shaped
# strings or forbidden guidance, (4) tenant/brand/instance are kept distinct.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
note() { printf '\n== %s\n' "$1"; }
bad() { printf '  FAIL %s\n' "$1"; fail=1; }

note "1. Relative link targets and anchors"
python3 scripts/check_links.py || fail=1

note "2. Architecture spec section coverage (§1-§34)"
map=docs/README.md
for n in $(seq 1 34); do
  grep -qE "^\| $n \|" "$map" || bad "§$n not in the coverage map ($map)"
done

note "3. Forbidden strings in docs and agent guidance"
# Secret-shaped literals and instructions that must never ship in the knowledge pack.
# Only real-looking values count; naming a forbidden token *shape* (sk_live_…) is allowed.
patterns='(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}|re_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|_KEY=[A-Za-z0-9/+_-]{8,}|password\s*=\s*["'"'"'][^"'"'"'<]'
grep_excludes=(--exclude-dir=.git --exclude-dir=.next --exclude-dir=.turbo --exclude-dir=coverage --exclude-dir=dist --exclude-dir=dist-distribution --exclude-dir=node_modules)
if grep -rInE "$patterns" "${grep_excludes[@]}" --include='*.md' . ; then bad "secret-shaped literal above"; fi

note "4. Unvalidated compliance claims"
if grep -rInE '\b(is|are|fully|GDPR|PDPL|PCI|SAMA|ZATCA)[ -]*(compliant|compliance certified)\b' "${grep_excludes[@]}" --include='*.md' . \
   | grep -viE 'not a compliance|no compliance|requires independent legal review|never claim|compliance claim'; then
  bad "compliance claim above — use 'requires independent legal review'"
fi

note "5. Tenant / brand / instance kept distinct"
grep -qiE 'tenant.{0,30}(and|,).{0,10}(brand|instance).{0,40}(are not|never).{0,20}synonym' docs/glossary.md \
  || bad "docs/glossary.md must state tenant/brand/instance are not synonyms"

note "6. Instance-repo prohibitions are stated exactly"
require_literal() {
  file=$1
  literal=$2
  grep -Fqi -- "$literal" "$file" || bad "$file is missing required prohibition: $literal"
}

require_literal AGENTS.md 'Never place Platform Admin code'
require_literal AGENTS.md 'Never author or run a database migration from a tenant instance repository.'
require_literal AGENTS.md 'Never use a Supabase service-role key'
require_literal docs/instance-docs-contract.md 'Never add Platform Admin code'
require_literal docs/instance-docs-contract.md 'Never add or run Supabase production migrations'
require_literal docs/instance-docs-contract.md 'Never use a Supabase service or secret key'

# Reject an affirmative permission near any of the three dangerous instance actions.
# Negative forms are filtered before the permission check.
for file in AGENTS.md docs/instance-docs-contract.md; do
  if grep -inE '(may|can|allowed to).{0,50}(run|author|add|use).{0,40}(migration|service-role|service or secret key|Platform Admin code)' "$file" \
    | grep -viE '(may|can).{0,12}(not|never)|cannot|can never|not allowed'; then
    bad "$file contains permissive migration, privileged-key, or Platform Admin guidance above"
  fi
done

printf '\n'
[ "$fail" = 0 ] && echo "docs check: PASS" || echo "docs check: FAIL"
exit "$fail"
