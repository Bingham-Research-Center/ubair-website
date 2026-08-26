#!/usr/bin/env bash
#
# fix-nginx-body-size.sh — raise nginx's request body limit on a basinwx box.
#
# Defaults to linode-dev, the only box that needs it today. Override with DOMAIN= for a
# preview box or any future host whose ingest arrives over public HTTPS.
#
# WHY THIS EXISTS
#   nginx defaults client_max_body_size to 1m. CHPC's HRRR forecast run files are
#   ~1.5 MB, so nginx returned 413 before Express ever saw them. The ~3 KB companion
#   <product>_index.json IS under the limit, so it kept landing hourly — which made
#   /api/filelist, pipeline_summary.json and (until PR #215) /api/monitoring/freshness
#   all report a healthy pipeline. Forecast run files silently stopped landing on
#   2026-04-27 and it went unnoticed until 2026-08-25.
#
#   This only affects .dev. Production's uploads arrive on loopback over the SSH tunnel
#   and bypass nginx entirely, and prod's nginx passes 1.5 MB anyway (measured: 401).
#
# WHAT IT DOES
#   Drops a single file at /etc/nginx/conf.d/upload-body-size.conf setting the limit at
#   http level, so every server block inherits it. It does NOT edit your vhosts.
#   Validates with `nginx -t` and rolls back automatically if the config is invalid.
#
# USAGE  (from the repo root)
#   sudo ./scripts/fix-nginx-body-size.sh                       # apply (default 32m)
#   sudo SIZE=64m ./scripts/fix-nginx-body-size.sh              # a different limit
#   sudo DOMAIN=sports.basinwx.dev ./scripts/fix-nginx-body-size.sh   # another host
#   sudo ./scripts/fix-nginx-body-size.sh --revert              # remove drop-in, reload
#   ./scripts/fix-nginx-body-size.sh --check                    # probe only, no root needed
#
# Production does NOT need this: its uploads arrive on loopback over the SSH tunnel and
# bypass nginx entirely, and its nginx already passes 1.5 MB (measured 2026-08-25: 401).
#
set -euo pipefail

DROPIN=/etc/nginx/conf.d/upload-body-size.conf
SIZE="${SIZE:-32m}"
DOMAIN="${DOMAIN:-www.basinwx.dev}"
MODE="${1:-apply}"

c_ok=$'\033[32m'; c_bad=$'\033[31m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$c_ok"  "$c_off" "$*"; }
bad()  { printf '%s✗%s %s\n' "$c_bad" "$c_off" "$*"; }
dim()  { printf '%s%s%s\n'   "$c_dim" "$*" "$c_off"; }

need_root() {
    if [[ ${EUID} -ne 0 ]]; then
        bad "Must run as root:  sudo $0 ${*:-}"
        exit 1
    fi
}

# Probe the REAL producer path: multipart/form-data, as the route's upload.single('file')
# and chpc_uploader.py's requests files= both use. Do NOT probe with a raw JSON body —
# server.js mounts express.json() with no limit, so its 100 kb default returns 500 on a
# perfectly healthy box and looks like a failure when nothing is wrong.
probe() {
    local tmp code
    tmp="$(mktemp -t bodyprobe.XXXXXX.json)"
    python3 -c "import json,sys; open(sys.argv[1],'w').write(json.dumps({'pad':'a'*1500000}))" "$tmp"
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 30 \
              -X POST "https://${DOMAIN}/api/upload/forecasts" \
              -F "file=@${tmp};filename=probe.json" 2>/dev/null || echo 000)"
    rm -f "$tmp"
    printf '%s' "$code"
}

report_probe() {
    local code="$1"
    case "$code" in
        401) ok  "HTTP 401 — the 1.5 MB upload reached the app (auth declined it, as expected). nginx is not blocking." ;;
        413) bad "HTTP 413 — nginx is still refusing the body. client_max_body_size has not taken effect." ;;
        000) bad "No response — is ${DOMAIN} reachable from here? (a .dev TLD is often SNI-filtered on campus LAN; try a phone tether)" ;;
        *)   bad "HTTP ${code} — unexpected. 500 usually means the probe hit express.json()'s 100 kb default, not the ingest path." ;;
    esac
}

case "$MODE" in
  --check)
      say "Probing ${DOMAIN} with a 1.5 MB multipart upload (no changes made)…"
      report_probe "$(probe)"
      exit 0
      ;;

  --revert)
      need_root --revert
      if [[ ! -f "$DROPIN" ]]; then
          say "Nothing to revert — ${DROPIN} does not exist."
          exit 0
      fi
      rm -f "$DROPIN"
      if nginx -t >/dev/null 2>&1; then
          systemctl reload nginx
          ok "Removed ${DROPIN} and reloaded nginx."
      else
          bad "nginx -t failed after removing the drop-in. Not reloading. Investigate:"
          nginx -t || true
          exit 1
      fi
      say ""
      say "Post-revert probe (expect 413 again):"
      report_probe "$(probe)"
      exit 0
      ;;

  apply|"")
      need_root
      ;;

  *)
      bad "Unknown option: ${MODE}"
      say "Usage: sudo $0 [--check|--revert]   (env: SIZE=32m DOMAIN=www.basinwx.dev)"
      exit 1
      ;;
esac

say "=== before ==="
before="$(probe)"
report_probe "$before"
if [[ "$before" == "401" ]]; then
    say ""
    ok "Already passing 1.5 MB — nothing to do."
    dim "(If you still want the drop-in pinned explicitly, delete ${DROPIN} check below and re-run.)"
    [[ -f "$DROPIN" ]] && dim "Drop-in already present: $(tr -d '\n' < "$DROPIN")"
    exit 0
fi

say ""
say "=== applying ==="

# Idempotent: writing the same content twice is a no-op. We never touch the vhosts.
had_dropin=no
[[ -f "$DROPIN" ]] && { had_dropin=yes; cp -a "$DROPIN" "${DROPIN}.bak"; }

cat > "$DROPIN" <<EOF
# Managed by fix-dev-nginx-body-size.sh — see docs/DEPLOYMENT.md §8 (silent-413 trap).
#
# nginx defaults to 1m. CHPC HRRR forecast run files are ~1.5 MB and were being 413ed
# before Express saw them, while the small companion index still landed — so the pipeline
# looked alive for four months. Set at http level so every server block inherits it.
client_max_body_size ${SIZE};
EOF
ok "Wrote ${DROPIN} (client_max_body_size ${SIZE})"

if ! nginx -t; then
    bad "nginx -t FAILED — rolling back, not reloading."
    if [[ "$had_dropin" == yes ]]; then mv -f "${DROPIN}.bak" "$DROPIN"; else rm -f "$DROPIN"; fi
    exit 1
fi
ok "nginx -t passed"
rm -f "${DROPIN}.bak"

systemctl reload nginx
ok "nginx reloaded"

say ""
say "=== after ==="
# `systemctl reload` is GRACEFUL: nginx keeps the old workers alive until their existing
# connections drain, and those workers still hold the OLD client_max_body_size. Probing
# immediately can therefore hit a stale worker and report 413 on a fix that actually
# worked -- which is exactly what happened on the first real run of this script
# (2026-08-25: drop-in written 04:07:00, new worker up 04:07:03, probe landed in between).
# So retry until a new worker answers rather than trusting a single shot.
after=000
for attempt in 1 2 3 4 5 6; do
    after="$(probe)"
    [[ "$after" == "401" ]] && break
    if [[ $attempt -lt 6 ]]; then
        dim "  attempt ${attempt}: HTTP ${after} — old workers may still be draining, retrying in 3s…"
        sleep 3
    fi
done
report_probe "$after"

say ""
if [[ "$after" == "401" ]]; then
    ok "Done. nginx is no longer blocking uploads."
    say ""
    say "The producer runs 4x daily at roughly 00:48, 06:48, 12:48 and 18:48 UTC"
    dim "(measured from logs/analytics/pipeline.log — note this does NOT match the"
    dim " '30 3,9,15,21 * * *' schedule declared in DATA_MANIFEST.json)."
    say "So recovery shows up at the next of those times, not within the hour."
    say ""
    say "Confirm the pipeline actually recovers — both should improve on their own:"
    dim "  curl -fsS https://${DOMAIN}/api/monitoring/freshness | python3 -m json.tool | grep -A4 forecasts"
    dim "  # 'forecasts' age should fall from ~119 days to minutes after the next producer run."
    say ""
    say "Expect a lingering false 'stale' on forecasts even once healthy:"
    dim "  dataMonitor.parseFrequency() only understands '*/N' and '0 */N' cron forms, so the"
    dim "  manifest's '30 3,9,15,21 * * *' falls through to a 60-minute default. With a real"
    dim "  6-hourly cadence that marks forecasts stale for ~4 of every 6 hours. Not fixed here."
    say ""
    dim "  # And the index should stop advertising files that 404 (DEPLOYMENT.md §6.11):"
    dim "  curl -fsS https://${DOMAIN}/api/static/forecasts/forecast_hrrr_surface_layers_index.json \\"
    dim "    | python3 -c 'import json,sys; [print(r[\"filename\"]) for r in json.load(sys.stdin)[\"runs\"]]' \\"
    dim "    | while read f; do echo \"\$(curl -s -o /dev/null -w '%{http_code}' https://${DOMAIN}/api/static/forecasts/\$f) \$f\"; done"
    exit 0
else
    bad "Limit did not take effect after 6 attempts (~15s). Two things to check:"
    dim "  # 1. An override in a server{} or location{} block:"
    dim "  sudo grep -rn client_max_body_size /etc/nginx/"
    dim "  # 2. Workers still draining a long-lived connection — re-probe by hand first:"
    dim "  sudo $0 --check"
    exit 1
fi
