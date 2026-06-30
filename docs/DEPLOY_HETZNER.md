# Deploy To Hetzner VPS

This is the recommended production path for the Pflegemittelbox MCP server.

Why this option wins for this project:

- fixed monthly cost
- no sleep behavior
- full control over SSE and long-running HTTP connections
- easy to add future services like QA backend workers and notification jobs
- GitHub-based redeploys without relying on trial-plan PaaS limits

## Recommended Server Size

Recommended starting point:

- Hetzner Cloud VPS
- Ubuntu 24.04 LTS
- 2 vCPU
- 4 GB RAM
- 40 GB SSD or larger

Why not the absolute smallest box:

- leaves room for the MCP server, SQLite logging, Caddy, and future background jobs
- avoids immediately re-sizing when you add QA or alerting services

If you want the absolute cheapest acceptable start, 2 GB RAM can work for only the MCP server, but 4 GB is the safer recommendation.

## DNS

Create an `A` record before enabling HTTPS:

- `mcp.yourdomain.com` -> `YOUR_SERVER_IP`

## One-Time Ubuntu Setup

SSH in as root:

```bash
ssh root@YOUR_SERVER_IP
```

Update packages:

```bash
apt update && apt upgrade -y
```

Install Docker and Compose plugin:

```bash
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git ufw
systemctl enable docker
systemctl start docker
```

Open only SSH, HTTP, and HTTPS:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## Clone The Repo

```bash
mkdir -p /opt/pflegemittelbox
cd /opt/pflegemittelbox
git clone https://github.com/zayzyyazy/pflegemittelboxmcp.git app
cd app
```

## Configure Environment

Copy the deploy env template:

```bash
cp deploy/hetzner/.env.example deploy/hetzner/.env
nano deploy/hetzner/.env
```

Set at least:

```text
DOMAIN=mcp.yourdomain.com
LETSENCRYPT_EMAIL=you@yourdomain.com
APP_PORT=3000
ENV_LABEL=hetzner
```

If you want email alerts from the server too, add the optional alert variables in that same file.

## Start The Stack

```bash
docker compose --env-file deploy/hetzner/.env -f deploy/hetzner/docker-compose.yml up -d --build
```

## What This Deploys

- `mcp` container: Node/TypeScript MCP server
- `caddy` container: automatic HTTPS and reverse proxy

## Restart Policy

Both services use:

```text
restart: unless-stopped
```

That means the server comes back after crashes and machine reboots unless you intentionally stop it.

## Logs

MCP app logs:

```bash
docker compose --env-file deploy/hetzner/.env -f deploy/hetzner/docker-compose.yml logs -f mcp
```

Caddy logs:

```bash
docker compose --env-file deploy/hetzner/.env -f deploy/hetzner/docker-compose.yml logs -f caddy
```

Container status:

```bash
docker compose --env-file deploy/hetzner/.env -f deploy/hetzner/docker-compose.yml ps
```

## Deploy Updates From GitHub

```bash
cd /opt/pflegemittelbox/app
git pull
docker compose --env-file deploy/hetzner/.env -f deploy/hetzner/docker-compose.yml up -d --build
```

## Health Checks

From the server:

```bash
curl http://127.0.0.1/health
curl http://127.0.0.1/mcp/sse
```

Public tests:

```bash
curl https://mcp.yourdomain.com/health
curl -i https://mcp.yourdomain.com/mcp/sse
```

## Final Leaping URL

Use this exact pattern in Leaping:

```text
https://mcp.yourdomain.com/mcp/sse
```

## Expected Public URLs

Health:

```text
https://mcp.yourdomain.com/health
```

MCP SSE:

```text
https://mcp.yourdomain.com/mcp/sse
```

## Data Persistence

SQLite logs are persisted from the repo's `data/` folder into the container at runtime.

Current DB path stays the same logic-wise:

```text
data/pflegemittelbox.db
```

## Troubleshooting

If HTTPS does not come up:

- confirm the DNS `A` record points to the server IP
- confirm ports 80 and 443 are open
- check Caddy logs

If the app fails to boot:

- check `docker compose ... logs -f mcp`
- confirm env vars are valid
- confirm `PUBLIC_BASE_URL` resolves to your domain through the compose env

If Leaping cannot connect:

- use `/mcp/sse`, not `/health`
- confirm the public health URL returns `ok: true`
- test the exact public MCP URL with `curl -i`
