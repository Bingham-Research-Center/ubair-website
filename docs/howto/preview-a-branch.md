# How to preview your branch on `basinwx.dev`

**Who this is for:** any dev (RA, student, visiting collaborator) who has pushed a branch to the repo and wants to see it running live against real CHPC data — **without taking over `www.basinwx.dev`** for everyone else.

**The 30-second version:** you get your own subdomain like `sports.basinwx.dev` that runs *your* branch. The main dev site keeps running on `dev`. Nobody steps on anyone.

---

## Before you start

You'll need:
- A branch pushed to `origin` (e.g. `feature/braxton-sports`).
- SSH access to the dev box as the `deploy` user. Ask John.
- Your username registered in `/srv/ubair-website/preview-apps.json` with a port and subdomain. Example entry:
  ```json
  { "user": "quinten", "branch": "feature/braxton-sports", "port": 3002, "subdomain": "sports" }
  ```
  If yours isn't there, open a tiny PR adding one line.

---

## The two ways to preview a branch (pick one)

### Mode A — "swap the whole dev site to my branch"

Quick and dirty. Fine when you're alone; **rude when anyone else is using `www.basinwx.dev`**, because it replaces what they see.

```bash
ssh deploy@www.basinwx.dev
cd /srv/ubair-website
git fetch origin
git checkout <your-branch>
pm2 restart ecosystem.config.cjs --update-env
```

Now `https://www.basinwx.dev/` is serving your branch. When you're done, `git checkout dev && pm2 restart ecosystem.config.cjs --update-env` to put it back.

**Rule of thumb:** don't use Mode A unless you've told the team in Slack/email first.

---

### Mode B — "my own subdomain, nobody else affected" (recommended)

Runs your branch *in parallel* on a separate port + subdomain. `www.basinwx.dev` keeps running `dev`. Everyone's happy.

#### First time only: spin up the preview

```bash
ssh deploy@www.basinwx.dev
cd /srv/ubair-website
scripts/manage-previews.sh up <your-username>
```

That script does the heavy lifting:
- Creates a `git worktree` — a second checkout of your branch at `/srv/ubair-website-preview-<user>/`.
- Symlinks the live CHPC data directory so your preview sees the same real observations as production.
- Copies `.env`, overrides `PORT` and sets `PREVIEW_MODE=true`.
- Runs `npm ci` and `pm2 start` with a derived app name like `basinwx-feature-braxton-sports`.
- Runs `pm2 save` so the preview survives a reboot.

At the end it prints nginx + certbot instructions. Run them once:

```bash
scripts/manage-previews.sh nginx <your-username> | sudo tee /etc/nginx/sites-available/<sub>.basinwx.dev
sudo ln -s /etc/nginx/sites-available/<sub>.basinwx.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --nginx -d <sub>.basinwx.dev
sudo systemctl reload nginx
```

Visit `https://<sub>.basinwx.dev/` — you should see your branch with live data.

#### Every time after: pull new commits into the preview

After you push new commits to your branch, refresh the preview:

```bash
scripts/manage-previews.sh update <your-username>
```

That fetches origin, hard-resets the worktree to `origin/<branch>`, re-runs `npm ci`, and restarts pm2.

#### When you're done: tear it down

Once your branch is merged (or you no longer need the preview):

```bash
scripts/manage-previews.sh down <your-username>
sudo rm /etc/nginx/sites-enabled/<sub>.basinwx.dev /etc/nginx/sites-available/<sub>.basinwx.dev
sudo certbot delete --cert-name <sub>.basinwx.dev
sudo systemctl reload nginx
```

---

## Gotchas and how to fix them

### My preview works but is double-emailing report notifications / burning UDoT API quota

Your branch doesn't have the `PREVIEW_MODE` gate yet (it lives in `server/server.js`, added in PR #182). Until you merge `dev` into your branch, the background jobs don't know they're in a preview.

**Quick fix** (edit in the preview's `.env`, not the main repo's):

```bash
nano /srv/ubair-website-preview-<user>/.env
# Set these two lines:
UDOT_API_KEY=
REPORT_EMAIL_ENABLED=false
# Save, then:
scripts/manage-previews.sh update <user>
```

**Proper fix:** open a PR from `dev` into your feature branch (pattern: PR #180). Once merged, the gate activates and `PREVIEW_MODE=true` in the preview's `.env` does the right thing automatically.

### Data isn't loading on my preview

Check the data symlink:
```bash
ls -la /srv/ubair-website-preview-<user>/public/api/static
# Should be a symlink → /srv/ubair-website/public/api/static
```

If it's a real directory or broken symlink, delete it and re-run `manage-previews.sh up <user>` — the script will recreate the link.

### Port already in use

The script's port check refused to start. Look at `ss -tlnp | grep <port>` on the box and either shut down whatever's there or pick a new port in `preview-apps.json`.

### "Connection reset" when I visit `<sub>.basinwx.dev` from campus

Not the server. Some networks filter `.dev` TLDs at the SNI layer. Tether to your phone's hotspot and retry — if cellular works, the site is fine and your LAN/wifi is the culprit. Clear browser HSTS cache or work from a different network.

### Cert issuance failed

If `certbot` times out on the HTTP-01 challenge, check:
1. DNS: `dig +short <sub>.basinwx.dev` should return `172.236.229.253`. If not, the wildcard `*.basinwx.dev` record at Namecheap isn't resolving — ask John.
2. Firewall: Linode Cloud Firewall defaults to Drop. Ports 80/443 must be explicitly accepted. Check the Linode console.

---

## Quick reference

| Command | What it does |
|---|---|
| `scripts/manage-previews.sh up <user>` | Create + start a new preview |
| `scripts/manage-previews.sh update <user>` | Pull latest from origin, restart |
| `scripts/manage-previews.sh down <user>` | Stop + remove worktree |
| `scripts/manage-previews.sh nginx <user>` | Print the nginx vhost snippet |
| `scripts/manage-previews.sh status` | List all configured previews |
| `pm2 list` | See which previews are running |
| `pm2 logs basinwx-<branch-slug>` | Tail your preview's logs |

---

## Why it works this way (the short version)

- **git worktree** lets one repo check out multiple branches into separate directories without cloning twice.
- **pm2** manages multiple Node processes on the box; each preview is its own pm2 app.
- **nginx** routes `<sub>.basinwx.dev` → `127.0.0.1:<port>` so the browser sees HTTPS on a normal URL.
- **Wildcard DNS** (`*.basinwx.dev` at Namecheap) means you never need to add a DNS record for a new preview.
- **Static symlink** to the main repo's `public/api/static` is why your preview sees live observations without duplicating uploads.

Full runbook (more operator-oriented than this guide): `docs/DEPLOYMENT.md` §9.
