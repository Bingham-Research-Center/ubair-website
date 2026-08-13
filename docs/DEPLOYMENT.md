# Deployment runbook — ubair-website

Canonical runbook for bringing up, operating, and troubleshooting `ubair-website` on the two Linode boxes. Same procedure works on both; the only difference is which branch and which domain.

## 1. Topology

### 1a. As deployed today (verified 2026-08-13)

| Role | Branch | Domain | pm2 app name | Port | Repo path | Runs as |
|---|---|---|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | **`ubair-site`** | `3000` | **`/var/www/ubair-website`** | **`root`** |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | `basinwx-dev` | `3001` | `/srv/ubair-website` | `deploy` |

Both rows confirmed by direct inspection on 2026-08-13 (`pm2 describe`, `ss -ltnp`, `git
rev-parse`, matching on-disk data-file counts). Production was inspected first; the dev box was
inspected later the same day, retiring the temporary `WEBSITE-DEVBOX-HANDOFF-aug13.md` (deleted
in the same change — its findings are folded into §1a, §7, §8, §10 and §11a here).

**The two boxes are not laid out the same way.** Production is the divergent one: dev already
matches the target layout in §1b, production does not. Don't generalise a fact from one box to
the other — every difference below was a real surprise.

Divergences from the target layout (§1b), on production:

- pm2 app is a **hand-started process named `ubair-site`**, not `basinwx-ops`.
  `ecosystem.config.cjs` is **not in use** on that box. Renaming a live pm2 app is a deliberate
  migration, not a side effect of a deploy — see §1c.
- Repo lives at `/var/www/ubair-website`, owned and run by `root`, not `deploy` under `/srv`.

nginx **is** configured and matches §4's intent, just under different vhost filenames:

| Vhost (`sites-enabled/`) | `server_name` | Notes |
|---|---|---|
| `ubair` | `www.basinwx.com basinwx.com` + `_` (`default_server`) | certbot cert at `/etc/letsencrypt/live/basinwx.com/` |
| `172-234-249-49.ip.linodeusercontent.com` | the Linode rDNS host | separate certbot cert |

Both proxy to `upstream ubair_app { server 127.0.0.1:3000; }`. Verified end to end:
`https://www.basinwx.com/api/health` → 200.

**The two boxes ingest over completely different paths.** This is the single most misleading
difference between them — verified on both, 2026-08-13, by reading the upload log lines each box
writes (`Access attempt from IP: <ip>, Hostname: <host>`):

| Box | Logged source IP | What it means |
|---|---|---|
| linode-prod | `::ffff:127.0.0.1` | loopback — CHPC reaches port 3000 through an **SSH session/tunnel**, *not* by POSTing to `https://www.basinwx.com` |
| linode-dev | `155.101.26.78` | notchpeak1's **real public IP** — CHPC POSTs straight to `https://www.basinwx.dev`, in through nginx → 3001 |

Both are accepted by the same rule: `server/routes/dataUpload.js` grants access when
`x-client-hostname` ends in `chpc.utah.edu` (log line `Access granted via hostname header`), so
the transport underneath never had to match.

Consequences, and they point in opposite directions:

- **On prod, a green public `/api/health` proves nothing about ingest** — the two paths are
  unrelated. When uploads stop there, check the SSH path before touching nginx or the app.
- **On dev, the public path *is* the ingest path.** If `https://www.basinwx.dev` is unreachable
  from the outside — expired cert, nginx down, firewall — ingest stops with it. Dev has no SSH
  ingest to fall back on: the `deploy` user has no `authorized_keys` at all, so nothing from
  CHPC is logging in.

Don't "fix" dev to match prod, or vice versa, without asking why. Ozone-season fan-out currently
depends on dev's public path staying up.

nginx on dev **is** populated (unlike prod, where `sites-enabled/` is empty and how traffic
reaches port 3000 is still undocumented):

| Vhost (`sites-enabled/`) | `server_name` | Proxies to |
|---|---|---|
| `basinwx.dev` | `basinwx.dev www.basinwx.dev` | `127.0.0.1:3001` |
| `regtest.basinwx.dev` | preview app (see §9) | — |

Cert `CN=basinwx.dev` valid to **2026-09-20**; `pm2-deploy.service` is `enabled`, so dev's pm2
resurrect survives reboot.

> **Serving caveat — applies to both boxes.** The app serves `public/` straight off the working
> tree, so `git checkout` changes what live traffic sees **immediately**, before any pm2
> restart. Never check out another branch in a live repo to inspect or stage it. Use
> `git worktree add /tmp/staging <branch>` instead, which leaves the deployed tree untouched.

### 1b. Target topology

The layout the rest of this runbook assumes. **linode-dev already matches this table** (verified
2026-08-13 — the dev row here and in §1a are the same values). Production has **not** been
migrated to it.

| Role | Branch | Domain | pm2 app name | Typical port | Repo path |
|---|---|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | `basinwx-ops` | `3000` | `/srv/ubair-website` |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | `basinwx-dev` | `3001` | `/srv/ubair-website` |

- Runtime: Node.js under pm2, started as the `deploy` user.
- TLS: nginx reverse proxy, Let's Encrypt certs under `/etc/letsencrypt/live/<domain>/`.
- pm2 app name is **derived from the checked-out branch** (`git rev-parse --abbrev-ref HEAD`), overridable via `PM2_APP_NAME`. See `ecosystem.config.cjs`.
- `www.basinwx.dev` is a **rehearsal mirror** of production: it receives the same CHPC data via fan-out upload, but runs whichever branch is checked out. Merging a PR into `dev` is the dry-run before promoting to `ops`.

### 1c. Migrating production to the target layout

Not part of a routine deploy, and never while pipeline testing is in flight. The `PM2_APP_NAME`
override exists so `ecosystem.config.cjs` can be adopted *before* committing to a rename —
`PM2_APP_NAME=ubair-site pm2 start ecosystem.config.cjs` reproduces today's app identity from
the config file. Renaming afterwards is `pm2 delete` + `pm2 start` + `pm2 save`, which means
brief downtime and a re-run of `pm2 startup`; verify the app survives a reboot before walking
away.

## 2. Deploy vs sudo — user boundary

| Acts as `deploy` (no sudo) | Needs `sudo` |
|---|---|
| `git pull`, `git checkout` | `nginx -t`, `systemctl reload nginx` |
| `npm ci`, `npm run` | `certbot ...` |
| `pm2 start/reload/save/logs` | `systemctl` (incl. `pm2-deploy` unit setup) |
| read/write `/srv/ubair-website` | write `/etc/nginx/`, `/etc/letsencrypt/` |
| read `.env` | `chmod`/`chown` under `/etc` |

Keep both boxes consistent with this split. `deploy` must own `/srv/ubair-website` recursively.

**Production does not currently follow this split** — it runs as `root` out of
`/var/www/ubair-website` (§1a). This section describes the target, not today.

## 3. Fresh-box bring-up

One-time per server. Substitute `<domain>` = `basinwx.dev` or `basinwx.com`, `<port>` = matching value.

```bash
# 3.1 Clone and permissions
sudo mkdir -p /srv/ubair-website
sudo chown -R deploy:deploy /srv/ubair-website
sudo -u deploy git clone https://github.com/Bingham-Research-Center/ubair-website.git /srv/ubair-website
cd /srv/ubair-website
sudo -u deploy git checkout <dev|ops>

# 3.2 Install
sudo -u deploy npm ci

# 3.3 Environment
sudo -u deploy cp .env.example .env
sudo -u deploy $EDITOR .env           # fill in DATA_UPLOAD_API_KEY, UDOT_API_KEY, SYNOPTIC_API_TOKEN, etc.
sudo chmod 600 /srv/ubair-website/.env
sudo chown deploy:deploy /srv/ubair-website/.env

# 3.4 Obtain TLS cert (nginx plugin will also write a baseline vhost; we'll overwrite it next)
sudo certbot certonly --nginx -d <domain> -d www.<domain>
sudo ls -l /etc/letsencrypt/live/<domain>/    # verify fullchain.pem + privkey.pem exist

# 3.5 Install the nginx vhost (template below)
sudo $EDITOR /etc/nginx/sites-available/<domain>
sudo ln -sf /etc/nginx/sites-available/<domain> /etc/nginx/sites-enabled/<domain>
sudo nginx -t
sudo systemctl reload nginx

# 3.6 Start the app under pm2
sudo -u deploy bash -lc 'cd /srv/ubair-website && pm2 start ecosystem.config.cjs'

# 3.7 Persist pm2 across reboots (run the exact command pm2 emits, not the template below)
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
sudo -u deploy bash -lc 'pm2 save'

# 3.8 Validate
curl -I http://127.0.0.1:<port>/            # expect 200
curl -I https://www.<domain>/                # expect 200 (HTTP/2)
```

## 4. nginx vhost template

Save as `/etc/nginx/sites-available/<domain>`, substitute `<domain>` and `<port>`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <domain> www.<domain>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name <domain> www.<domain>;

    ssl_certificate /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:<port>;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

If certbot stored the cert under a different directory name, check `sudo ls -l /etc/letsencrypt/live/` and update the `ssl_certificate*` paths accordingly.

## 5. Routine operations

### Pull a new commit into the running branch

```bash
sudo -u deploy bash -lc 'cd /srv/ubair-website && git pull && npm ci && pm2 reload ecosystem.config.cjs --update-env && pm2 save'
```

### Swap the dev box to a feature branch for a demo

```bash
sudo -u deploy bash -lc '
  cd /srv/ubair-website &&
  git fetch --all &&
  git checkout <feature-branch> &&
  npm ci &&
  # Delete only our own branch-derived pm2 apps. Never "pm2 delete all" — it
  # nukes unrelated apps running under the same deploy user.
  for app in $(pm2 jlist | python3 -c "import json,sys; print(\"\\n\".join(a[\"name\"] for a in json.load(sys.stdin) if a[\"name\"].startswith(\"basinwx-\")))"); do
    pm2 delete "$app"
  done &&
  pm2 start ecosystem.config.cjs &&
  pm2 save
'
```

Swap back to `dev` with the same sequence. The pm2 app name auto-becomes `basinwx-<branch>`.

### Certificate renewal

certbot installs a systemd timer that renews automatically. Verify:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

If nginx isn't reloading after renewal, check `/etc/letsencrypt/renewal-hooks/deploy/` for a reload hook, or add one:

```bash
echo -e '#!/bin/sh\nsystemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/nginx-reload
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload
```

## 6. "Did this work?" — ordered sanity checklist

Run these top-to-bottom when the browser shows an unexpected response. First failing step is the diagnosis.

```bash
# 6.1  Right branch?
cd /srv/ubair-website && git branch --show-current

# 6.2  pm2 process online and named correctly?
pm2 list                                       # expect: basinwx-<branch>, status online

# 6.3  pm2 survives reboot?
systemctl list-unit-files | grep pm2           # expect: pm2-deploy.service  enabled
# If empty: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy

# 6.4  .env locked down?
ls -l /srv/ubair-website/.env                  # expect: -rw-------  deploy deploy

# 6.5  App responding internally?
PORT=$(grep -E '^PORT=' /srv/ubair-website/.env | cut -d= -f2)
curl -I http://127.0.0.1:${PORT}/              # expect: HTTP/1.1 200

# 6.6  nginx config valid?
sudo nginx -t

# 6.7  nginx listening on both 80 and 443?
ss -tlnp | grep -E ':(80|443)\b'

# 6.8  Cert present and not near expiry?
sudo certbot certificates                      # expect: > 30 days to expiry

# 6.9  External HTTPS OK?
curl -I https://www.<domain>/                  # expect: HTTP/2 200

# 6.10 Recent pm2 log history clean?
pm2 logs basinwx-$(git -C /srv/ubair-website branch --show-current) --lines 50 --nostream
```

## 7. CHPC data fan-out

CHPC runs `scripts/chpc_uploader.py` and the shell helpers in `chpc-deployment/`. The uploader consumes **`BASINWX_API_URLS`** (comma-separated). First URL is **primary** — its failure fails the job. Remaining URLs are **best-effort mirrors** — failures emit a loud WARN but the job still exits 0.

Recommended CHPC env:

```bash
export BASINWX_API_KEY="..."   # must equal DATA_UPLOAD_API_KEY in the target box's .env.
                               # NB: on the servers' own .env files these two keys do NOT
                               # match each other — see §8. Only the value CHPC sends matters.
export BASINWX_API_URLS="https://basinwx.com,https://basinwx.dev"
```

To temporarily stop mirroring to dev (e.g., during dev-side maintenance), drop `basinwx.dev` from the list. To upload **only** to dev (e.g., testing a pipeline change), set `BASINWX_API_URLS="https://basinwx.dev"` alone.

> **Two upload code paths exist on CHPC, and only one fans out.**
> `load_config_urls()` in `brc-tools/brc_tools/download/push_data.py` honours the
> list above. `load_config()` returns *only the first URL*, and
> `clyfar/export/to_basinwx.py` reads the **singular** `BASINWX_API_URL`.
> Anything on those paths silently reaches `.com` alone. If a dataType is missing
> from `.dev`, check which loader its producer calls before suspecting the network.

**Fan-out coverage as measured on linode-dev, 2026-08-13** (counted from upload-log lines, not
inferred). Earlier docs said observations + metadata were the *only* dataTypes reaching `.dev`;
that is no longer true — `forecasts` and `road-forecast` began arriving on 2026-08-13. Re-measure
before repeating any version of this claim:

| dataType | Arriving on `.dev`? | Uploads, all-time | Uploads, last 24h |
|---|---|---|---|
| `metadata` | yes | 31 773 | 525 |
| `observations` | yes | 31 553 | 520 |
| `road-forecast` | yes — **new 2026-08-13** | 2 | 2 |
| `forecasts` | yes — **new 2026-08-13** | 2 | 1 |
| `outlooks` | **no — never uploaded** (see trap below) | 0 | 0 |
| `images` | **no — never uploaded** | 0 | 0 |
| `llm_outlooks` | **no — never uploaded** | 0 | 0 |
| `timeseries` | **no — never uploaded** | 0 | 0 |

`images` / `llm_outlooks` are the ones still stuck on a non-fanning loader; `timeseries` has no
producer yet. Reproduce with:

```bash
grep -a 'File uploaded' ~/.pm2/logs/basinwx-dev-out.log \
  | grep -ao 'Type: [a-z-]*' | sort | uniq -c | sort -rn
```

> **Trap: `/api/monitoring/freshness` reports `outlooks` as `"fresh"` with `ageMinutes: 0` on a
> box that has never received a single `outlooks` upload.** Freshness is computed from the
> newest file in the dataType's directory, and `outlooks_list.json` is an **index the server
> regenerates itself** every few minutes — so its mtime is always ~now regardless of whether any
> producer is feeding the directory. On dev the actual content behind that green status is
> sample/template files dated 2026-04-17. Any dataType whose directory holds a
> server-regenerated index can mask a dead producer this way; confirm against the upload log
> (`Type: <dataType>`) before trusting a `fresh` verdict.

## 7a. Reading the dev/ops split

`.dev` is not a staging toy — it takes the same CHPC fan-out as `.com` and is
where stakeholder demos happen. The two boxes deliberately run different branches,
so the first question in any investigation is *which box am I actually looking at*.

**Version tells you.** `GET /api/health` reports `version` and `manifestVersion`:

```bash
curl -fsS https://www.basinwx.com/api/health   # -> "version": "1.5.0"     (tag v1.5.0)
curl -fsS https://www.basinwx.dev/api/health   # -> "version": "1.5.1-dev"
```

`dev` always carries the *next* version with a `-dev` suffix. The dev→ops
promotion PR strips the suffix, `ops` gets tagged `v<version>`, and `dev`
immediately bumps to the next `-dev`. The two boxes therefore never report the
same string. `manifestVersion` is `DATA_MANIFEST.json`'s version — the one number
brc-tools and this repo both agree on, bumped MINOR for additive dataTypes and
MAJOR when a field or unit changes (which requires a matching brc-tools release
*before* promotion).

**A dataType can exist on `dev` and not on `ops`.** `server/routes/dataUpload.js`
lists accepted dataTypes per branch, so a producer pushing something `ops` has
never heard of gets a 400 from `.com` while `.dev` accepts it happily. That is
the intended behaviour, not a bug — it stops half-built features reaching
production. The corresponding CHPC-side convention lives in
`brc-tools/docs/WEBSITE-INTEGRATION.md`: a cron wrapper pins
`BASINWX_API_URLS="https://basinwx.dev"` **if and only if** its consumer is on
`dev` but not yet on `ops`, and is unpinned in the brc-tools PR that follows the
promotion.

So the steady state is a loop, not a resting point:

1. Feature lands on `dev`; its producer's wrapper is pinned to `.dev`.
2. Rehearse on `.dev` with real data and no production risk.
3. Promote `dev`→`ops`, tag, unpin the wrapper.
4. Bump `dev` to the next `-dev`.

The pin and the `-dev` suffix are the two visible markers of "ahead of
production". Keep them in step: a wrapper still pinned after its consumer reached
`ops` is merely stale, but an *unpinned* wrapper whose consumer is dev-only will
400 against `.com` every cycle.

**After merging into `dev`**, on the dev box: `git pull && pm2 restart basinwx-dev`
(as `deploy`, in `/srv/ubair-website`), then re-check `/api/health` for the expected version and
`/api/monitoring/freshness` for per-dataType staleness. `PREVIEW_MODE=true` gates
background refresh and report emails, so preview apps don't double-burn upstream
quotas — see §9.

## 8. Known gotchas

- **`.dev` TLDs are HSTS-preloaded.** Browsers refuse plain HTTP. The nginx template above returns 301 → HTTPS which is required, not a nice-to-have.
- **`deploy` vs. `sudo` user.** pm2's state (`~/.pm2/`) lives in `deploy`'s home. Never run pm2 as root or any other user, or you end up with two separate daemons and mystifying "process not found" behaviour.
- **pm2 startup unit.** Without it, a reboot silently loses the site. Step 3.7 is not optional.
- **Heap default.** Node defaults to ~1.5 GB old-space but Linode boxes can OOM under concurrent loads. `ecosystem.config.cjs` sets `max_memory_restart: 512M` as a guardrail; if you see repeated restarts, investigate logs before raising the ceiling.
- **Secrets in scripts.** The CHPC setup script must read `DATA_UPLOAD_API_KEY` from env, not carry it as a literal. If you rotate the key, rotate it in the server `.env` files and on CHPC at the same time.
- **`BASINWX_API_KEY` ≠ `DATA_UPLOAD_API_KEY` in `.env` — on *both* boxes** (verified 2026-08-13: prod, then dev; on dev the two are not even the same length). On prod there is also a `.env` comment claiming they match — it is wrong; dev has no such comment, just a stale commented-out `DATA_UPLOAD_API_KEY` on line 5 that no longer matches the live one. **Ingest is unaffected** — the server only ever validates `DATA_UPLOAD_API_KEY`, and dev has been accepting CHPC uploads continuously with zero denials. But `scripts/chpc_uploader.py` reads `BASINWX_API_KEY`, so running the uploader *from a server* as a self-test returns **401 and looks exactly like an auth regression when nothing is broken**. Check this before debugging any 401. The only thing that must be true is that each box's `DATA_UPLOAD_API_KEY` equals the key CHPC fans out to it — on dev that is confirmed by live uploads landing, not by reading the file.

## 9. Per-user branch previews

Preview apps let a developer's feature branch run live on its own subdomain (`<subdomain>.basinwx.dev`) without disturbing the main `dev` deployment. Configuration is in `preview-apps.json` at the repo root.

### Managing previews (as `deploy` user on the dev box)

```bash
# Start Quinten's sports preview on port 3002 at sports.basinwx.dev
scripts/manage-previews.sh up quinten

# Get the nginx vhost config
scripts/manage-previews.sh nginx quinten | sudo tee /etc/nginx/sites-available/sports.basinwx.dev
sudo ln -s /etc/nginx/sites-available/sports.basinwx.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Obtain TLS cert (must succeed before HTTPS will work)
sudo certbot certonly --nginx -d sports.basinwx.dev
sudo systemctl reload nginx

# Pull latest commits from the feature branch
scripts/manage-previews.sh update quinten

# Tear down when no longer needed
scripts/manage-previews.sh down quinten

# List all configured previews + pm2 status
scripts/manage-previews.sh status
```

### How it works

1. `up` creates a `git worktree` of the feature branch at `/srv/ubair-website-preview-<user>` (sibling to the main repo).
2. The worktree's `public/api/static` is symlinked to the main dev repo's so the preview shows live CHPC data.
3. A `.env` is created with `PORT=<preview port>` and `PREVIEW_MODE=true` (disables background refresh and report emails).
4. `npm ci` installs dependencies, then `pm2 start ecosystem.config.cjs` launches the app.
5. The pm2 app name is derived from the branch name by `ecosystem.config.cjs` — e.g. `basinwx-feature-braxton-sports`.

### Adding a new user / preview

Add an entry to `preview-apps.json` (choose a port not used by any other process — ops=3000, dev=3001, existing previews listed there), then open a PR.

```json
{ "user": "julianna", "branch": "feature/julianna-aviation", "port": 3003, "subdomain": "aviation" }
```

### Notes

- Preview apps do **not** receive CHPC uploads — they read static data from the dev server's shared directory. Do not add a preview URL to `BASINWX_API_URLS`.
- **PREVIEW_MODE must be in the branch code, not just the `.env`.** The gate is a guard inside `server/server.js` that checks `process.env.PREVIEW_MODE`. Setting `PREVIEW_MODE=true` in a preview's `.env` only works if the feature branch already contains the gate (merged from `dev`). Until the branch syncs, the preview will still run `backgroundRefresh` + `reportEmailService` and double-poll UDoT / duplicate report emails.
  - **Workaround when the branch is not yet synced with dev:** before running `up`, or immediately after, edit `/srv/ubair-website-preview-<user>/.env` and blank the relevant keys — e.g. `UDOT_API_KEY=` and `REPORT_EMAIL_ENABLED=false` — then `scripts/manage-previews.sh update <user>` (or `pm2 restart <pm2_name>`) to pick them up. Restore them after the branch has synced and `PREVIEW_MODE` is doing its job.
- Ports are hardcoded in `preview-apps.json`; update the file and the nginx vhost if you need to change a port.

## 10. Gotcha — SSH pubkey auth rejects `ssh-rsa` (observed 2026-08-13)

`/var/log/auth.log` on linode-prod shows, on an hourly `:24` schedule:

```
sshd[...]: userauth_pubkey: signature algorithm ssh-rsa not in PubkeyAcceptedAlgorithms [preauth]
```

OpenSSH 8.8+ disables the SHA-1 `ssh-rsa` signature algorithm by default. Any producer or cron
still offering an RSA key with a SHA-1 signature will fail authentication **silently from the
client's perspective** — it just looks like the job stopped working.

This matters here because CHPC delivers uploads over SSH (§1a). Check this before blaming the
app, nginx, or the API key.

Fixes, in order of preference:

1. **Re-key the client to Ed25519** — `ssh-keygen -t ed25519` on the producer, install the
   public key in the target's `authorized_keys`. Best long-term answer.
2. **Have the client offer SHA-2 with the existing RSA key** — modern clients negotiate
   `rsa-sha2-256`/`rsa-sha2-512` automatically; an old client may need upgrading.
3. **Re-enable SHA-1 on the server (last resort, weakens auth):** add to `/etc/ssh/sshd_config`
   and reload sshd:
   ```
   PubkeyAcceptedAlgorithms +ssh-rsa
   HostkeyAlgorithms +ssh-rsa
   ```

Confirm which key the failing job uses before changing anything — `sshd -T | grep -i pubkey`
shows the server's current accepted list.

**On linode-dev (checked 2026-08-13): same server-side policy, but it cannot break dev's
pipeline.** dev runs OpenSSH 9.6p1; `/etc/ssh/sshd_config` sets no `PubkeyAcceptedAlgorithms`
and `/etc/ssh/sshd_config.d/` is empty, so the SHA-1-disabled default applies exactly as on
prod. The difference is that **dev has no SSH ingest to break** — `deploy` has no
`authorized_keys` file at all and CHPC POSTs to dev over public HTTPS (§1a). So an `ssh-rsa`
rejection on dev would affect a human operator's login, never the data feed.

Not yet confirmed on dev: whether `/var/log/auth.log` actually carries the hourly rejection
line. Reading it needs `sudo` (the `deploy` user is in the `sudo` group but has no passwordless
rule, and is not in `adm`), so it was left for an operator:

```bash
sudo grep 'not in PubkeyAcceptedAlgorithms' /var/log/auth.log | tail
```

## 11. Gotcha — the box is exposed to SSH brute force

`/var/log/auth.log` shows continuous credential stuffing against `root` and common usernames
from many IPs (dozens of failures per hour). All observed attempts failed, but password auth on
`root` over the public internet is a standing risk on a box that also holds the pipeline API key.

Worth doing, independent of any deploy: set `PermitRootLogin prohibit-password` and
`PasswordAuthentication no` in `/etc/ssh/sshd_config` (confirm key-based access works first),
and consider fail2ban plus a Linode firewall rule restricting port 22 to known ranges.

### 11a. linode-dev — hardened 2026-08-13. **linode-prod still is not.**

Dev was found in the same exposed state as prod and fixed the same day:

| Setting | dev, before | dev, now | prod |
|---|---|---|---|
| `PermitRootLogin` | `yes` | **`prohibit-password`** | `yes` — still to do |
| `PasswordAuthentication` | `yes` | **`no`** | `yes` — still to do |
| `fail2ban` | inactive | **active + enabled** | still to do |

Verified after the change: sshd offers `Permission denied (publickey)` only — password auth is
genuinely off, not just edited in the file. `deploy` authenticates with an ed25519 key; root has
no password path in. `/etc/ssh/sshd_config.d/` is empty, so `/etc/ssh/sshd_config` is
authoritative on this box.

**Prod is now the weaker of the two.** It still permits root password login from the open
internet while holding the live pipeline key. Apply §11 there next.

#### Two traps if you repeat this on prod

1. **The unit is `ssh`, not `sshd`.** `sudo systemctl reload sshd` fails with `Unit
   sshd.service not found` — and it fails *after* you have already edited the config, so it is
   easy to believe nothing happened when in fact the change is staged and live-on-next-restart.
2. **Install the key first, and prove it works, before reloading.** On dev the config was edited
   while `deploy` had no `authorized_keys` at all; only the failed reload (trap 1) kept password
   auth alive long enough to fix it. A reboot alone would have applied the config and locked
   everyone out — `ssh.socket` is enabled at boot, so new connections read the config fresh.

Correct order, from the **client**, while password auth still works:

```bash
ssh-keygen -t ed25519                 # only if you have no key yet
ssh-copy-id <user>@<host>
ssh <user>@<host>                     # MUST succeed with no password prompt
# only now, on the server:
sudo systemctl reload ssh             # 'ssh', not 'sshd'
```

Keep the original session open until a *new* one authenticates. Confirm which methods the
server offers with:

```bash
ssh -o BatchMode=yes <user>@127.0.0.1 true   # want: "Permission denied (publickey)."
```

Still unmeasured on dev (needs `sudo`; `deploy` is in `sudo` but not `adm`, so `auth.log` is
unreadable to it):

```bash
sudo grep -c 'Failed password for root' /var/log/auth.log   # scale of brute-force traffic
```
