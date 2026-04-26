# Accessing `basinwx.dev` when the domain is blocked

Some campus/corporate networks blacklist `.dev` TLDs or `basinwx.dev` specifically. Two workarounds:

## Option 1 — plain IP via nginx (quick)

The dev box IP is `172.236.229.253`. nginx serves the `dev` branch as its default vhost, so:

```
http://172.236.229.253/
```

No TLS, but fully functional. May still be blocked if the firewall filters the IP directly.

## Option 2 — SSH tunnel (most reliable)

Forwards the Node process (port 3001) over SSH — bypasses DNS, domain filters, and firewall rules entirely.

```bash
ssh -L 8080:localhost:3001 deploy@172.236.229.253
```

Then browse to `http://localhost:8080/`. Works as long as SSH (port 22) isn't also blocked.

## Background

- Node (`basinwx-dev`) listens on **port 3001**, bound to localhost only.
- nginx proxies `www.basinwx.dev` → `127.0.0.1:3001` on ports 80/443.
- If the domain is unreachable, the SSH tunnel is the fastest workaround that requires no config changes on the server.

> If cellular works but campus wifi doesn't, the site is fine — it's a client-side network filter. See also: `docs/DEPLOYMENT.md` bring-up lessons.
