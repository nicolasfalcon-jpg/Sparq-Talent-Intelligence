#!/usr/bin/env bash
# Builds the app, starts it, and captures a static (no-JS) HTML snapshot of the main screens
# into ./snapshot — used for visual review where no headless browser is available.
# Usage: bash scripts/static-snapshot.sh [port]
set -euo pipefail
PORT="${1:-3100}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/snapshot"
cd "$ROOT"
NEXT_TELEMETRY_DISABLED=1 npx next build > /tmp/sparq-build.log 2>&1
PORT="$PORT" npx next start > /tmp/sparq-start.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf "localhost:$PORT/" >/dev/null && break; sleep 1; done
rm -rf "$OUT" && mkdir -p "$OUT" && cd "$OUT"
B="http://localhost:$PORT"
get() { curl -s ${3:-} "$B$1" -o "$2.html"; }
get / home
get /people people
get "/people?q=Engineers+with+React+Native+and+native+iOS+experience&sel=ana" people-search
get /people/ana passport-ana
get /people/marcus passport-marcus
get /opportunities opportunities
get /planning planning
get /me/passport my-passport "-b sparq_demo_persona=engineer"
for c in $(grep -oh '/_next/static/[^"]*\.css' ./*.html | sort -u); do mkdir -p ".$(dirname "$c")"; curl -s "$B$c" -o ".$c"; done
for f in $(grep -oh 'url(/_next/static/media/[^)]*)' _next/static/css/*.css | sed 's/url(//;s/)//' | sort -u); do mkdir -p ".$(dirname "$f")"; curl -s "$B$f" -o ".$f"; done
python3 - <<'EOF'
import re, glob
for f in glob.glob('*.html'):
    s = open(f).read()
    # Resolve streamed Suspense boundaries (normally swapped in by inline JS).
    pat = r'<div hidden id="S:(\d+)">(.*?)</div><script>(?:(?!</script>).)*?\$RC\("B:\1","S:\1"\)'
    for m in list(re.finditer(pat, s, flags=re.S)):
        n, body = m.group(1), m.group(2)
        s = re.sub(r'<!--\$\?--><template id="B:%s"></template>.*?<!--/\$-->' % n, lambda _: body, s, count=1, flags=re.S)
    s = re.sub(r'<div hidden id="S:\d+">.*?</div>(?=<script>(?:(?!</script>).)*?\$RC)', '', s, flags=re.S)
    s = re.sub(r'<script\b[^>]*>.*?</script>', '', s, flags=re.S)
    s = re.sub(r'<link[^>]*rel="preload"[^>]*>', '', s)
    s = s.replace('"/_next/', '"_next/')
    open(f, 'w').write(s)
for f in glob.glob('_next/static/css/*.css'):
    s = open(f).read().replace('url(/_next/static/media/', 'url(../media/')
    open(f, 'w').write(s)
EOF
echo "Snapshot written to $OUT"
