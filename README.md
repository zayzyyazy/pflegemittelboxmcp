# Pflegemittelbox MCP

Pflegemittelbox MCP is a Node.js MCP server plus a small developer dashboard for building, testing, and operating Marie support tools used from Leaping AI.

The production deployment target is a public HTTPS endpoint on the Pflegemittelbox company server. MCP routes are protected with shared-secret authentication so random public traffic cannot call the tools.

## Current architecture

| Part | Purpose |
| --- | --- |
| `server/` | Express + TypeScript MCP server, REST admin API, SQLite-backed logs/settings, post-call monitor |
| `dashboard/` | Local React dashboard for testing tools, checking logs, and editing non-secret settings |
| `data/` | Runtime SQLite database for tool logs, settings, and processed post-call alerts |

## Public endpoints

| Endpoint | Purpose | Auth |
| --- | --- | --- |
| `/health` | Health and runtime status | public |
| `/mcp/sse` | Leaping MCP endpoint (streamable HTTP) | required |
| `/mcp/messages` | Legacy MCP SSE message handler | required |
| `/api/*` | Local dashboard/admin API | no MCP auth layer; keep behind your own server access controls |

## MCP authentication

Production must enable MCP authentication. The server refuses production startup if MCP auth is disabled or incomplete.

Supported modes:

### Bearer token

```env
MCP_AUTH_ENABLED=true
MCP_AUTH_TYPE=bearer
MCP_AUTH_TOKEN=replace-with-a-long-random-secret
```

Leaping sends:

```text
Authorization: Bearer YOUR_SECRET
```

### Custom header

```env
MCP_AUTH_ENABLED=true
MCP_AUTH_TYPE=header
MCP_AUTH_HEADER_NAME=X-MCP-API-Key
MCP_AUTH_HEADER_VALUE=replace-with-a-long-random-secret
```

Leaping sends:

```text
X-MCP-API-Key: YOUR_SECRET
```

## Current production tool list

| Tool | Purpose |
| --- | --- |
| `normalize_vnr` | Normalize messy spoken German VNR text |
| `pmb_normalize_vnr` | Alias for `normalize_vnr` |
| `pmb_address_verification_guardrail` | Parse and preserve PLZ, house number, and birthday during address fallback |
| `pmb_verification_brain` | Deterministic verification decision engine |
| `pmb_delivery_status_reasoner` | Deterministic delivery-status answer helper |
| `pmb_post_call_alert_detector` | Detect dropped/failed/problematic calls from structured call data |
| `pmb_post_call_email_notifier` | Send post-call alert emails, with LLM-drafted email content and deterministic fallback |
| `health_check` | MCP reachability check |
| `pmb_health_check` | Alias for `health_check` |

## Post-call monitoring and alerts

The server can run an optional background monitor outside the Leaping workflow graph.

What it does:

- logs into Leaping with configured API credentials
- fetches recent finished calls for a configured agent/clone
- maps those calls into the deterministic alert detector
- sends alert emails when a call needs review
- avoids duplicate alerts by storing processed call IDs in SQLite

Email delivery currently supports Gmail SMTP and Resend. If LLM drafting is enabled, the server uses an OpenAI-compatible endpoint to generate the email subject/body and falls back to plain text if the LLM call fails.

## Local development

### Install

From the repo root:

```bash
npm install
npm run setup
```

### Configure

```bash
cd server
cp .env.example .env
```

### Run

From the repo root:

```bash
npm run dev
```

This starts:

- server on `http://localhost:3001`
- dashboard on `http://localhost:5173`

## Production deployment

Primary deployment path:

- company server
- Node.js 22 LTS
- PM2 or system service
- public HTTPS handled by IT

Use these files:

- `server/.env.production.example`
- `docs/DEPLOY_COMPANY_SERVER.md`

### Production server commands

From `server/`:

```bash
npm install
npm test
npm run build
npm start
```

### PM2 example

```bash
cd server
pm2 start npm --name pflegemittelbox-mcp -- start
pm2 save
```

## Environment variables

Minimum production set:

```env
NODE_ENV=production
ENV_LABEL=company
PORT=3000
PUBLIC_BASE_URL=https://leapingai-api.pflegemittelbox.de
MCP_AUTH_ENABLED=true
MCP_AUTH_TYPE=bearer
MCP_AUTH_TOKEN=replace-with-a-long-random-secret
```

Optional variables are documented in `server/.env.example` and `server/.env.production.example`.

## Verification

Health:

```bash
curl https://DOMAIN/health
```

Unauthenticated MCP check:

```bash
curl -i https://DOMAIN/mcp/sse
```

Expected: `401 Unauthorized`

Authenticated tool discovery:

```bash
curl -X POST https://DOMAIN/mcp/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Notes

- Runtime SQLite files under `data/` are operational artifacts and should not be committed.
- Secrets belong in `server/.env` on the target server, never in the repo.
- The dashboard is an operator convenience tool, not part of the public Leaping integration path.
