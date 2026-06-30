# Pflegemittelbox MCP

Pflegemittelbox MCP is a Node.js MCP server plus a small developer dashboard for building, testing, and operating Marie support tools used from Leaping AI.

The production deployment target is a public HTTPS endpoint on the Pflegemittelbox company server. MCP routes are protected with shared-secret authentication so random public traffic cannot call the tools.

## Current architecture

| Part | Purpose |
| --- | --- |
| `server/` | Express + TypeScript MCP server, REST admin API, SQLite-backed logs/settings, post-call monitor |
| `dashboard/` | Internal React dashboard served by the Node server under `/ui` for testing tools, checking logs, recent alerts, and editing non-secret settings |
| `data/` | Runtime SQLite database for tool logs, settings, and processed post-call alerts |

## Public endpoints

| Endpoint | Purpose | Auth |
| --- | --- | --- |
| `/health` | Health and runtime status | public |
| `/mcp/sse` | Leaping MCP endpoint (streamable HTTP) | required |
| `/mcp/messages` | Legacy MCP SSE message handler | required |
| `/api/*` | Legacy local dashboard/admin API | not for public exposure |
| `/api/dashboard/*` | Internal dashboard API used by `/ui` | required dashboard auth |
| `/ui` | Internal operator dashboard | required dashboard auth |

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

## Dashboard authentication

The internal dashboard is protected separately from the MCP routes.

```env
DASHBOARD_AUTH_ENABLED=true
DASHBOARD_AUTH_USERNAME=operator
DASHBOARD_AUTH_PASSWORD=replace-with-a-long-random-password
```

The server refuses production startup if dashboard auth is not enabled.

## Current production tool list

| Tool | Purpose |
| --- | --- |
| `normalize_vnr` | Normalize messy spoken German VNR text |
| `pmb_normalize_vnr` | Alias for `normalize_vnr` |
| `pmb_address_verification_guardrail` | Parse and preserve PLZ, house number, and birthday during address fallback |
| `pmb_verification_brain` | Deterministic verification decision engine |
| `pmb_verification_phone_brain` | Clone-only phone verification controller |
| `pmb_verification_address_brain` | Clone-only address fallback verification controller |
| `pmb_verification_vnr_brain` | Clone-only VNR verification controller |
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

## Clone verification experiment

For Marie clone testing, the verification flow can use three narrow MCP brains as deterministic step controllers:

- Phone method -> `pmb_verification_phone_brain`
- Address method -> `pmb_verification_address_brain`
- VNR method -> `pmb_verification_vnr_brain`

The clone should ask the MCP what to do next and follow `next_action` exactly.

Recommended integration pattern:

- On the first verification MCP call, always pass `phone_lookup_found` from the real `get_customer_by_phone` result.
- Pass `latest_customer_input` only as the customer's answer to the current verification question.
- Do not pass the customer's Anliegen, requested month, or general request text as `latest_customer_input`.
- If available, pass a stable `session_id` / call ID so the verification brains can reuse stored PLZ, house number, birthday, VNR, and function results across turns.

Minimal clone prompt for the verification experiment:

- At stage start call MCP immediately.
- After every customer verification answer call MCP again.
- If `action_type=SAY_ONLY`, say only `say`.
- If `action_type=CALL_FUNCTION`, call `function_name` with `function_arguments`.
- After every native function result call MCP again with the dedicated result field.
- Never call native verification functions unless MCP returns `action_type=CALL_FUNCTION`.
- Never generate verification wording yourself.

Important: the MCP only reduces wrong-order decisions if it is used as a gatekeeper. If all native Leaping functions stay enabled in one large stage, Marie can still call functions in the wrong order. The safer setup is to restrict enabled native functions per clone stage so the clone can only execute the function that the MCP brain explicitly allows.

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

In production, build the dashboard and the server serves it at `/ui`.

## Production deployment

Primary deployment path:

- company server
- Node.js 22 LTS
- PM2 or system service
- public HTTPS handled by IT

Use these files:

- `server/.env.production.example`
- `docs/DEPLOY_COMPANY_SERVER.md`

### Dashboard build

From `dashboard/`:

```bash
npm install
npm run build
```

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

### Deploy from your Mac

After finishing local changes, run:

```bash
./scripts/deploy-mcp.sh "Improve verification brains"
```

If you pass a commit message, the script will:

- show `git status`
- run `git add .`
- commit and push
- SSH to the company server
- pull latest code
- run `npm install`
- run tests
- build
- restart PM2
- check the public health endpoint

If you run it without a commit message, it deploys only code that is already pushed:

```bash
./scripts/deploy-mcp.sh
```

### Tiny shortcut command

There is also a small helper command in the repo:

```bash
./scripts/server
```

It supports:

```bash
./scripts/server ssh
./scripts/server deploy
./scripts/server deploy "Improve verification brains"
./scripts/server health
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
