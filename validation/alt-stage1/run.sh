#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$OUT/logs"
exec > >(tee "$OUT/logs/coordinator.log") 2>&1
printf 'stage=1\nstage2_authorized=false\nworkpack=%s\nbaseline=%s\n' "$WP" "$BASELINE" > "$OUT/authority.txt"
cd "$REPO"
test "$(git rev-parse HEAD)" = "$BASELINE"
test -z "$(git status --porcelain --untracked-files=no)"
test "$(node -p 'process.versions.node.split(".")[0]')" = 22
test "$(pnpm --version)" = 10.23.0
{ date -u +%FT%TZ; uname -a; node -v; pnpm -v; python3 -V; git rev-parse HEAD; } > "$OUT/environment.txt"
step() {
  local label="$1"; shift
  local rc=0
  echo "=== $label ==="
  "$@" >"$OUT/logs/$label.log" 2>&1 || rc=$?
  printf '%s\t%s\n' "$label" "$rc" >> "$OUT/command-exits.tsv"
  tail -n 35 "$OUT/logs/$label.log" || true
  return "$rc"
}
# Coordinator read live Common skill/schema through GitHub; ACK only that exact read SHA.
rc=0
step relay-refresh python3 scripts/relay-v31-live.py refresh || rc=$?
if [[ "$rc" == 2 ]]; then
  actual=$(python3 -c 'import json,os;print(json.load(open(".git/relay-v31-live/current.json"))["common_sha"])')
  test "$actual" = "$COMMON_READ_SHA"
  step relay-ack python3 scripts/relay-v31-live.py acknowledge --sha "$actual"
  step relay-recheck python3 scripts/relay-v31-live.py refresh
elif [[ "$rc" != 0 ]]; then
  echo "Relay refresh failed; exact live basis not acknowledged"; exit 3
fi
grep -q LIVE_V31_ACKNOWLEDGED "$OUT/logs/relay-"*.log
step python-deps python3 -m pip install --disable-pip-version-check --no-input PyMuPDF==1.26.7 pypdf==5.9.0 Pillow==12.0.0
step frozen-install pnpm install --frozen-lockfile
ln -s "$REPO/frontend/node_modules" "$PKG/node_modules"
export ALT_PYTHON="$(command -v python3)" ALT_EVIDENCE_DIR="$OUT" ALT_WP02_OUTPUT="$OUT" ALT_WP03_EVIDENCE_DIR="$OUT"
export ALT_WP02_MACHINE="ubuntu-24.04;github-run=$GITHUB_RUN_ID;$(uname -m)"
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173/Pdf-Hub/
python3 "$GITHUB_WORKSPACE/harness/validation/alt-stage1/integrate.py" "$WP" "$PKG" | tee "$OUT/logs/integration-delta.log"
# Additional read-only tests are copied as untracked files into Vitest discovery; removed on exit.
if [[ "$WP" != 03 ]]; then
extra="$REPO/frontend/src/core/alt-stage1-supplement.test.ts"
cp "$GITHUB_WORKSPACE/harness/validation/alt-stage1/supplement.test.ts" "$extra"
if [[ "$WP" == 01 ]]; then supplemental="A05|A08"; else supplemental="R04"; fi
export ALT_FIXTURE_DIR="$PKG/fixtures"
step supplemental-vitest pnpm -C frontend exec vitest run src/core/alt-stage1-supplement.test.ts --pool=forks --maxWorkers=1 -t "$supplemental" || true
rm -f "$extra"
fi
case "$WP" in
  01)
    mkdir -p "$OUT"/{benchmarks,native,native-inspections,screenshots,observations,playwright-artifacts}
    step oracle-controls python3 "$PKG/validators/check_controls.py" "$OUT/negative-control-selftest.json"
    step focused-vitest pnpm -C frontend exec vitest run src/core/annotations src/core/pdf-annotations --pool=forks --maxWorkers=1 || true
    cfg="$PKG/playwright.config.ts"; functional='A0[1-8]';;
  02)
    mkdir -p "$OUT"/{native,diagnostics,controls}
    step fixture-receipt python3 "$PKG/validators/verify_fixtures.py"
    step oracle-controls python3 "$PKG/validators/selftest_native_oracles.py" "$OUT/controls"
    step focused-vitest pnpm -C frontend exec vitest run src/core/review src/core/annotations src/core/pdf-annotations src/components/writer-v2 --pool=forks --maxWorkers=1 || true
    cfg="$PKG/playwright.config.cjs"; functional='R0[1-9]';;
  03)
    mkdir -p "$OUT"/{native,independent}
    step fixture-receipt python3 "$PKG/validators/validate.py" fixtures
    step oracle-controls python3 "$PKG/validators/validate.py" selftest
    step focused-vitest pnpm -C frontend exec vitest run src/core/writer-v2 src/components/writer-v2 src/core/select-box-copy src/components/select-box-copy --pool=forks --maxWorkers=1 || true
    for cert in writer-overlay-v2 writer-table-pro writer-blank-doc; do step "certify-$cert" pnpm -C frontend run "certify:$cert" || true; done
    cfg="$PKG/playwright.config.cjs"; functional='W0[1-7]';;
  *) exit 64;;
esac
step typecheck pnpm -C frontend run typecheck || true
step production-build env VITE_BASE_PATH=/Pdf-Hub/ pnpm -C frontend run build
step artifact-verification node frontend/scripts/verify-pages-artifact.mjs frontend/dist /Pdf-Hub/
step chromium-install pnpm -C frontend exec playwright install --with-deps chromium
pnpm -C frontend exec vite preview --host 127.0.0.1 --port 4173 --strictPort >"$OUT/logs/preview.log" 2>&1 &
preview=$!
trap 'kill "$preview" 2>/dev/null || true' EXIT
curl --fail --silent --show-error --retry 30 --retry-connrefused --retry-delay 1 "$PLAYWRIGHT_BASE_URL" >"$OUT/preview-index.html"
step production-shell node frontend/scripts/smoke-pages-build.mjs "$PLAYWRIGHT_BASE_URL"
# Preserve original test files and frozen expected model. Separate runs prevent
# Playwright from deleting earlier traces. No retry, no assertion changes.
f_rc=0; b_rc=0
step functional-browser pnpm -C frontend exec playwright test --config "$cfg" --grep "$functional" --output "$OUT/playwright-artifacts" --workers=1 --retries=0 || f_rc=$?
if [[ -f "$OUT/playwright-results.json" ]]; then mv "$OUT/playwright-results.json" "$OUT/playwright-functional-results.json"; fi
if [[ -d "$OUT/playwright-report" ]]; then mv "$OUT/playwright-report" "$OUT/playwright-functional-report"; fi
step benchmark-browser pnpm -C frontend exec playwright test --config "$cfg" --grep 'B0[1-3]' --output "$OUT/playwright-benchmark-artifacts" --workers=1 --retries=0 || b_rc=$?
if [[ -f "$OUT/playwright-results.json" ]]; then mv "$OUT/playwright-results.json" "$OUT/playwright-benchmark-results.json"; fi
if [[ -d "$OUT/playwright-report" ]]; then mv "$OUT/playwright-report" "$OUT/playwright-benchmark-report"; fi
python3 - "$OUT" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]); combined={'suites':[],'errors':[]}
for n in ['functional','benchmark']:
    f=p/f'playwright-{n}-results.json'
    if f.exists():
        x=json.loads(f.read_text());combined['suites']+=x.get('suites',[]);combined['errors']+=x.get('errors',[])
    else:combined['errors'].append({'message':f'{n} report missing'})
(p/'playwright-results.json').write_text(json.dumps(combined,indent=2))
# Raw test results are observations, not automatic product defect classifications.
rows=[]
def walk(suites):
    for suite in suites:
        for spec in suite.get('specs',[]):
            for test in spec.get('tests',[]):
                res=test.get('results',[])
                rows.append({'title':spec.get('title'),'status':res[-1].get('status') if res else 'NOT_RUN','errors':[(r.get('error') or {}).get('message') for r in res if r.get('error')],'classification':'REVIEW_REQUIRED'})
        walk(suite.get('suites',[]))
walk(combined['suites'])
(p/'coordinator-raw-results.json').write_text(json.dumps({'stage1_accepted':False,'tests':rows,'report_errors':combined['errors']},indent=2))
print(json.dumps({'tests':len(rows),'statuses':{s:sum(r['status']==s for r in rows) for s in sorted({r['status'] for r in rows})}}))
PY
case "$WP" in
  01) step agent-collector python3 "$PKG/validators/build_evidence.py" || true;;
  02) step agent-collector python3 "$PKG/validators/collect_results.py" --input "$OUT/playwright-results.json" --output "$OUT/ALT_WP02_case_results.json" || true
      step agent-manifest python3 "$PKG/validators/generate_evidence_manifest.py" --package "$PKG" --output "$OUT" || true;;
  03) step agent-collector python3 "$PKG/validators/collect.py" --evidence "$OUT" || true;;
esac
# Keep all observed failures; do not mark failed browser assertions as proved product defects.
printf 'functional_exit=%s\nbenchmark_exit=%s\n' "$f_rc" "$b_rc" > "$OUT/browser-exits.txt"
test "$f_rc" = 0 && test "$b_rc" = 0
