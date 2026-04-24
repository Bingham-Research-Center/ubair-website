#!/usr/bin/env bash
# manage-previews.sh — spin up / tear down per-user branch preview apps.
#
# Each preview runs a git worktree of a feature branch on its own port,
# served by nginx on <subdomain>.basinwx.dev. Configuration lives in
# preview-apps.json at the repo root.
#
# Usage:
#   scripts/manage-previews.sh up     <user>   # create worktree + start pm2
#   scripts/manage-previews.sh down   <user>   # stop pm2 + remove worktree
#   scripts/manage-previews.sh update <user>   # pull latest from origin
#   scripts/manage-previews.sh nginx  <user>   # print nginx vhost snippet
#   scripts/manage-previews.sh status          # list all preview apps
#
# Must be run as the 'deploy' user (same as the main pm2 process).

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_DIR/preview-apps.json"
WORKTREE_ROOT="/srv"

# ── helpers ──────────────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

require_deploy_user() {
  [[ "$(whoami)" == "deploy" ]] || die "Run as the 'deploy' user (current: $(whoami))"
}

# Read a field from preview-apps.json for a given user via Node (avoids
# reimplementing JSON parsing in shell and keeps logic consistent).
get_field() {
  local user="$1" field="$2"
  node --input-type=module <<EOF
import { readFileSync } from 'fs';
const apps = JSON.parse(readFileSync('$CONFIG', 'utf8'));
const app = apps.find(a => a.user === '$user');
if (!app) { process.stderr.write('Unknown user: $user\n'); process.exit(1); }
process.stdout.write(String(app['$field']));
EOF
}

# Derive the pm2 app name the same way ecosystem.config.cjs does.
pm2_name_for_branch() {
  local branch="$1"
  node --input-type=module <<EOF
const branch = '$branch'
  .replace(/[^A-Za-z0-9_-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+|-+\$/, '') || 'unknown';
process.stdout.write('basinwx-' + branch);
EOF
}

worktree_dir_for() {
  echo "$WORKTREE_ROOT/ubair-website-preview-$1"
}

# ── subcommands ───────────────────────────────────────────────────────────────

cmd_up() {
  local user="$1"
  require_deploy_user

  local branch port worktree_dir
  branch=$(get_field "$user" branch)
  port=$(get_field "$user" port)
  worktree_dir=$(worktree_dir_for "$user")

  # Port sanity check
  if ss -tlnp 2>/dev/null | grep -q ":$port " || \
     netstat -tlnp 2>/dev/null | grep -q ":$port "; then
    die "Port $port is already in use. Check 'ss -tlnp | grep $port' and choose a free port."
  fi

  # Create worktree if needed
  if [ -d "$worktree_dir" ]; then
    echo "Worktree already exists at $worktree_dir — skipping creation."
  else
    echo "Fetching origin..."
    git -C "$REPO_DIR" fetch origin

    echo "Creating worktree for $user (branch: $branch) at $worktree_dir..."
    if git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$branch"; then
      # Local branch exists — use it directly
      git -C "$REPO_DIR" worktree add "$worktree_dir" "$branch"
    else
      # Remote-only branch — create local tracking branch in worktree
      git -C "$REPO_DIR" worktree add --track -b "$branch" "$worktree_dir" "origin/$branch"
    fi
  fi

  # Symlink static data directory so preview shows real live data
  local static_src="$REPO_DIR/public/api/static"
  local static_dst="$worktree_dir/public/api/static"
  if [ ! -L "$static_dst" ]; then
    rm -rf "$static_dst"
    ln -sf "$static_src" "$static_dst"
    echo "Linked static data: $static_dst → $static_src"
  fi

  # Set up .env for this preview (copy from main, override PORT + PREVIEW_MODE)
  if [ ! -f "$worktree_dir/.env" ]; then
    echo "Copying .env and setting PORT=$port, PREVIEW_MODE=true..."
    cp "$REPO_DIR/.env" "$worktree_dir/.env"
    if grep -q '^PORT=' "$worktree_dir/.env"; then
      sed -i "s/^PORT=.*/PORT=$port/" "$worktree_dir/.env"
    else
      echo "PORT=$port" >> "$worktree_dir/.env"
    fi
    if grep -q '^PREVIEW_MODE=' "$worktree_dir/.env"; then
      sed -i "s/^PREVIEW_MODE=.*/PREVIEW_MODE=true/" "$worktree_dir/.env"
    else
      echo "PREVIEW_MODE=true" >> "$worktree_dir/.env"
    fi
  fi

  # Install dependencies
  echo "Installing npm dependencies..."
  npm ci --prefix "$worktree_dir" --silent

  # Start pm2
  echo "Starting pm2 app..."
  pm2 start "$worktree_dir/ecosystem.config.cjs"

  local pm2_name
  pm2_name=$(pm2_name_for_branch "$branch")
  echo ""
  echo "✓ Preview for '$user' is running."
  echo "  pm2 app:  $pm2_name"
  echo "  port:     $port"
  echo "  worktree: $worktree_dir"
  echo ""
  echo "Next steps:"
  echo "  1. Add nginx vhost:    $0 nginx $user | sudo tee /etc/nginx/sites-available/sports.basinwx.dev"
  echo "  2. Enable + reload:    sudo ln -s /etc/nginx/sites-available/sports.basinwx.dev /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx"
  echo "  3. Obtain TLS cert:    sudo certbot certonly --nginx -d sports.basinwx.dev"
  echo "  4. Reload nginx again: sudo systemctl reload nginx"
}

cmd_down() {
  local user="$1"
  require_deploy_user

  local branch worktree_dir pm2_name
  branch=$(get_field "$user" branch)
  worktree_dir=$(worktree_dir_for "$user")
  pm2_name=$(pm2_name_for_branch "$branch")

  echo "Stopping pm2 app: $pm2_name..."
  pm2 delete "$pm2_name" 2>/dev/null || echo "  (app not found in pm2 — already stopped?)"

  if [ -d "$worktree_dir" ]; then
    echo "Removing worktree: $worktree_dir..."
    git -C "$REPO_DIR" worktree remove "$worktree_dir" --force
  else
    echo "  (worktree not found at $worktree_dir — already removed?)"
  fi

  echo "✓ Preview for '$user' stopped."
}

cmd_update() {
  local user="$1"
  require_deploy_user

  local branch worktree_dir pm2_name
  branch=$(get_field "$user" branch)
  worktree_dir=$(worktree_dir_for "$user")
  pm2_name=$(pm2_name_for_branch "$branch")

  [ -d "$worktree_dir" ] || die "Worktree not found. Run '$0 up $user' first."

  echo "Fetching latest for $branch..."
  git -C "$REPO_DIR" fetch origin
  git -C "$worktree_dir" reset --hard "origin/$branch"

  echo "Updating npm dependencies..."
  npm ci --prefix "$worktree_dir" --silent

  echo "Restarting pm2 app: $pm2_name..."
  pm2 restart "$pm2_name"

  echo "✓ Preview for '$user' updated to latest origin/$branch."
}

cmd_nginx() {
  local user="$1"
  local port subdomain
  port=$(get_field "$user" port)
  subdomain=$(get_field "$user" subdomain)
  local domain="${subdomain}.basinwx.dev"

  cat <<NGINX
# nginx vhost for preview: $domain → port $port
# ------------------------------------------------------
# 1. Save:    $0 nginx $user | sudo tee /etc/nginx/sites-available/$domain
# 2. Enable:  sudo ln -s /etc/nginx/sites-available/$domain /etc/nginx/sites-enabled/
# 3. Test:    sudo nginx -t && sudo systemctl reload nginx
# 4. Cert:    sudo certbot certonly --nginx -d $domain
# 5. Reload:  sudo systemctl reload nginx

server {
    listen 80;
    server_name $domain;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    server_name $domain;

    ssl_certificate     /etc/letsencrypt/live/$domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass         http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
}

cmd_status() {
  echo "=== Configured preview apps (preview-apps.json) ==="
  node --input-type=module <<'EOF'
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const config = resolve(process.env.REPO_DIR, 'preview-apps.json');
const apps = JSON.parse(readFileSync(config, 'utf8'));
for (const a of apps) {
  const slug = a.branch.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/, '');
  console.log(`  ${a.user.padEnd(12)} branch=${a.branch}  port=${a.port}  subdomain=${a.subdomain}.basinwx.dev  pm2=basinwx-${slug}`);
}
EOF
  echo ""
  echo "=== pm2 preview apps ==="
  pm2 list --no-color 2>/dev/null | grep -E "basinwx-(feature|preview|quinten|braxton|julianna)" || echo "  (none running)"
}

# ── main ─────────────────────────────────────────────────────────────────────

export REPO_DIR="$REPO_DIR"

case "${1:-}" in
  up)     [[ -n "${2:-}" ]] || die "Usage: $0 up <user>"; cmd_up "$2" ;;
  down)   [[ -n "${2:-}" ]] || die "Usage: $0 down <user>"; cmd_down "$2" ;;
  update) [[ -n "${2:-}" ]] || die "Usage: $0 update <user>"; cmd_update "$2" ;;
  nginx)  [[ -n "${2:-}" ]] || die "Usage: $0 nginx <user>"; cmd_nginx "$2" ;;
  status) cmd_status ;;
  *) echo "Usage: $0 {up|down|update|nginx|status} [user]"; exit 1 ;;
esac
