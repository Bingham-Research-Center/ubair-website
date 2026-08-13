# Deployment runbook — ubair-website

Canonical runbook for bringing up, operating, and troubleshooting `ubair-website` on the two Linode boxes. Same procedure works on both; the only difference is which branch and which domain.

## 1. Topology

### 1a. As deployed today (verified 2026-08-13)

| Role | Branch | Domain | pm2 app name | Port | Repo path | Runs as |
|---|---|---|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | **`ubair-site`** | `3000` | **`/var/www/ubair-website`** | **`root`** |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | *unverified* | *unverified* | *unverified* | *unverified* |

Production values confirmed by direct inspection of linode-prod on 2026-08-13 (`pm2 describe`,
`git rev-parse`, matching on-disk data-file counts). **The dev box was not inspected** — do not
assume it matches either row until someone verifies it and updates this table. See
`WEBSITE-DEVBOX-HANDOFF-aug13.md`.

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

**CHPC uploads arrive over SSH, not from the public internet.** Upload log lines read
`Access attempt from IP: ::ffff:127.0.0.1, Hostname: notchpeak1.int.chpc.utah.edu` — the source
is loopback, so the producer reaches port 3000 through an SSH session/tunnel from CHPC rather
than POSTing to `https://www.basinwx.com`. Consequence: **`/api/health` can be perfectly green
from the outside while ingest is dead**, because the two paths are unrelated. When uploads stop,
check the SSH path before touching nginx or the app.

> **Serving caveat — applies to both boxes.** The app serves `public/` straight off the working
> tree, so `git checkout` changes what live traffic sees **immediately**, before any pm2
> restart. Never check out another branch in a live repo to inspect or stage it. Use
> `git worktree add /tmp/staging <branch>` instead, which leaves the deployed tree untouched.

### 1b. Target topology

The layout the rest of this runbook assumes. Production has **not** been migrated to it.

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
export BASINWX_API_KEY="..."                            # matches DATA_UPLOAD_API_KEY on the servers
export BASINWX_API_URLS="https://basinwx.com,https://basinwx.dev"
```

To temporarily stop mirroring to dev (e.g., during dev-side maintenance), drop `basinwx.dev` from the list. To upload **only** to dev (e.g., testing a pipeline change), set `BASINWX_API_URLS="https://basinwx.dev"` alone.

## 8. Known gotchas

- **`.dev` TLDs are HSTS-preloaded.** Browsers refuse plain HTTP. The nginx template above returns 301 → HTTPS which is required, not a nice-to-have.
- **`deploy` vs. `sudo` user.** pm2's state (`~/.pm2/`) lives in `deploy`'s home. Never run pm2 as root or any other user, or you end up with two separate daemons and mystifying "process not found" behaviour.
- **pm2 startup unit.** Without it, a reboot silently loses the site. Step 3.7 is not optional.
- **Heap default.** Node defaults to ~1.5 GB old-space but Linode boxes can OOM under concurrent loads. `ecosystem.config.cjs` sets `max_memory_restart: 512M` as a guardrail; if you see repeated restarts, investigate logs before raising the ceiling.
- **Secrets in scripts.** The CHPC setup script must read `DATA_UPLOAD_API_KEY` from env, not carry it as a literal. If you rotate the key, rotate it in the server `.env` files and on CHPC at the same time.

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

## 11. Gotcha — the box is exposed to SSH brute force

`/var/log/auth.log` shows continuous credential stuffing against `root` and common usernames
from many IPs (dozens of failures per hour). All observed attempts failed, but password auth on
`root` over the public internet is a standing risk on a box that also holds the pipeline API key.

Worth doing, independent of any deploy: set `PermitRootLogin prohibit-password` and
`PasswordAuthentication no` in `/etc/ssh/sshd_config` (confirm key-based access works first),
and consider fail2ban plus a Linode firewall rule restricting port 22 to known ranges.
