#!/usr/bin/env python3
"""probe.py -- check the BasinWX boxes from anywhere, with nothing but python3.

Usage:  scripts/probe.py [host ...]          default: www.basinwx.com www.basinwx.dev
Env:    DATA_UPLOAD_API_KEY   if set, also lists the last upload attempts (server >= 1.5.5)
        PROBE_TIMEOUT         seconds per request (default 15)
Exit:   0 when every check passed, 1 when something FAILed (WARN lines do not fail).

Per host it reports:
  dns      addresses; WARN if the apex domain also points somewhere that is not this box
  tls      certificate days remaining (FAIL under 14)
  health   version, manifest, commit, branch, startedAt, vendorAssets (the last four need >= 1.5.5)
  vendor   HEAD of a file served out of node_modules -- tells you whether `npm install` ran
  fresh    /api/monitoring/freshness, one line per dataType
  uploads  /api/monitoring/uploads, last 5 attempts (only with the key)
  release  the newest v* tag in this checkout, if run inside the repo, against the version served

This is the outside view only. It cannot see pm2, nginx or logs; for those you need a shell
on the box (docs/DEPLOYMENT.md section 6).
"""
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

DEFAULT_HOSTS = ["www.basinwx.com", "www.basinwx.dev"]
VENDOR_FILE = "/vendor/leaflet.markercluster/leaflet.markercluster.js"
TIMEOUT = float(os.environ.get("PROBE_TIMEOUT", "15"))
FAILED = False


def say(level, msg):
    global FAILED
    if level == "FAIL":
        FAILED = True
    print(f"  {level:<5} {msg}")


def fetch(url, method="GET", headers=None):
    """Return (status, body_text). Network errors come back as (None, message)."""
    req = urllib.request.Request(url, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # DNS, TLS, timeout
        return None, f"{type(e).__name__}: {e}"


def addresses(host):
    try:
        return sorted({ai[4][0] for ai in socket.getaddrinfo(host, 443, socket.AF_INET)})
    except socket.gaierror as e:
        return []


def cert_days_left(host):
    ctx = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=TIMEOUT) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as tls:
            not_after = tls.getpeercert()["notAfter"]
    expires = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    return (expires - datetime.now(timezone.utc)).days, expires.date().isoformat()


def newest_tag():
    try:
        out = subprocess.run(["git", "tag", "--sort=-v:refname", "--list", "v*"],
                             capture_output=True, text=True, timeout=5, check=True).stdout
        return out.split()[0] if out.split() else None
    except Exception:
        return None


def version_tuple(v):
    m = re.match(r"(\d+)\.(\d+)\.(\d+)", v or "")
    return tuple(int(x) for x in m.groups()) if m else None


def probe(host, tag):
    print(f"== {host} ==")
    base = f"https://{host}"

    ips = addresses(host)
    say("ok" if ips else "FAIL", f"dns      {' '.join(ips) or 'no A record'}")
    apex = host[4:] if host.startswith("www.") else None
    if apex:
        extra = sorted(set(addresses(apex)) - set(ips))
        if extra:
            say("WARN", f"dns      {apex} also resolves to {' '.join(extra)}, which is not this box; "
                        f"producers should target {host}")

    try:
        days, when = cert_days_left(host)
        say("FAIL" if days < 14 else "ok", f"tls      {days} days left (expires {when})")
    except Exception as e:
        say("FAIL", f"tls      {type(e).__name__}: {e}")

    status, body = fetch(f"{base}/api/health")
    if status != 200:
        say("FAIL", f"health   {status or ''} {body[:120]}")
        return
    h = json.loads(body)
    version = h.get("version")
    say("ok", f"health   version {version}  manifest {h.get('manifestVersion')}")
    if "commit" in h:
        va = h.get("vendorAssets") or {}
        say("ok", f"build    {h.get('commit')} on {h.get('branch')}, started {h.get('startedAt')}")
        if va.get("ok") is False:
            say("FAIL", f"build    vendor assets missing: {', '.join(va.get('missing', []))} -> run `npm install`, restart")
    else:
        say("WARN", "build    this server does not report commit/startedAt/vendorAssets yet (added in 1.5.5)")

    vt = version_tuple(version)
    vcode, _ = fetch(base + VENDOR_FILE, method="HEAD")
    if vcode == 200:
        say("ok", "vendor   markercluster served from node_modules")
    elif vt and vt >= (1, 5, 4):
        say("FAIL", f"vendor   {VENDOR_FILE} -> {vcode}: `npm install` did not run on this box")
    else:
        say("WARN", f"vendor   {vcode} (expected: the route arrived in 1.5.4)")

    if tag and vt:
        tag_t = version_tuple(tag[1:])
        if version.endswith("-dev"):
            say("ok" if vt > tag_t else "WARN", f"release  {version} vs newest tag {tag}")
        elif vt < tag_t:
            say("WARN", f"release  serving {version}, newest tag is {tag}: deploy pending")
        else:
            say("ok", f"release  matches newest tag {tag}")

    status, body = fetch(f"{base}/api/monitoring/freshness")
    if status == 200:
        for name, f in (json.loads(body).get("freshness") or {}).items():
            st = f.get("status")
            age = f.get("ageMinutes")
            lvl = "ok" if st == "fresh" else "WARN"
            detail = f"{age} min old, expected every {f.get('expectedFreqMinutes')}" if age is not None else f.get("message", "")
            say(lvl, f"fresh    {name:<14} {st:<8} {detail}")
    else:
        say("WARN", f"fresh    {status} {body[:100]}")

    key = os.environ.get("DATA_UPLOAD_API_KEY")
    if key:
        status, body = fetch(f"{base}/api/monitoring/uploads?limit=5", headers={"x-api-key": key})
        if status == 200 and "recent" in body:
            data = json.loads(body)
            say("ok", f"uploads  {data.get('buffered', 0)} attempts since start; newest first:")
            for a in data.get("recent", []):
                flag = "ok " if a.get("ok") else "REJ"
                print(f"           {a.get('ts')} {flag} {a.get('status')} {a.get('dataType')} "
                      f"{a.get('filename') or '-'} from {a.get('hostname') or a.get('ip')} ({a.get('detail')})")
        elif status == 200 and "Log file not found" in body:
            say("WARN", "uploads  this server does not list attempts yet (added in 1.5.5)")
        else:
            say("WARN", f"uploads  {status} {body[:100]}")
    else:
        say("ok", "uploads  (set DATA_UPLOAD_API_KEY to list recent attempts)")


def main(argv):
    hosts = argv[1:] or DEFAULT_HOSTS
    tag = newest_tag()
    for host in hosts:
        probe(host, tag)
    print("RESULT:", "FAIL" if FAILED else "ok")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
