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

For Marie **clone testing only** (not production Marie), the verification flow can use three narrow MCP brains as deterministic step controllers:

- Phone method -> `pmb_verification_phone_brain`
- Address method -> `pmb_verification_address_brain`
- VNR method -> `pmb_verification_vnr_brain`

The clone should ask the MCP what to do next and follow `action_type` exactly. Marie receives a **minimal controller object** from the three verification brains; full debug stays in MCP logs and the operator dashboard.

### Controller vs debug response split

**Leaping MCP** (`pmb_verification_phone_brain`, `pmb_verification_address_brain`, `pmb_verification_vnr_brain`) returns only:

```json
{
  "ok": true,
  "action_type": "CALL_FUNCTION",
  "say": "",
  "function_name": "get_customer_by_plz_geb",
  "function_arguments": { "plz": "41372", "hnr": "100", "bday": "1956-03-16" },
  "transition_name": null,
  "requires_followup_mcp_call": true,
  "active_brain": "address",
  "session_id_received": true,
  "session_mode": "session"
}
```

**Dashboard / SQLite logs** retain `{ "controller": { ... }, "debug": { ... } }` with `stored_values`, `attempts`, `reason`, `next_action`, `safety_flags`, `known_values_required_next_call`, etc.

Do not rely on Leaping seeing `stored_values` or raw native lookup payloads — bind function results into the next MCP input instead.

### Safety and observability

- **Marie/Leaping** receives only the slim `controller` object (no `stored_values`, no raw CRM payloads).
- **Dashboard / SQLite logs** store `{ controller, debug }` with sanitized inputs/outputs.
- Native API results (`get_customer_by_plz_geb_result`, etc.) are summarized as `found` / `not_found` / `error` in logs — never full customer records.
- Customer-provided values (spoken PLZ, house number, birthday, VNR) remain visible for operator debugging.
- Use **Session Inspector** in the dashboard (`/ui/sessions/:session_id`) to view all MCP calls for one `leaping_conversation_id_hex` chronologically.

### Leaping clone setup (recommended)

Leaping exposes stable reserved conversation fields:

- `leaping_conversation_id`
- `leaping_conversation_id_hex`
- `leaping_conversation_id_int`

For deterministic verification, prefer a **Leaping Function node** for MCP brain calls (not free-form LLM tool invocation) and bind tool arguments like this:

| MCP argument | Leaping binding |
|---|---|
| `session_id` | `leaping_conversation_id_hex` |
| `latest_customer_input` | latest customer utterance for the current verification question |
| `phone_lookup_found` | result of `get_customer_by_phone` |
| function result fields | native function output from the previous turn |

Rules:

- **Use** `session_id = leaping_conversation_id_hex` on every MCP brain call in the same conversation.
- **Do not** use MCP tool-call IDs (`call_...`) as `session_id`; they change per invocation and break memory.
- **Use** `function_arguments` verbatim for native Leaping function calls when MCP returns `action_type = CALL_FUNCTION`.
- **If** `session_id` is missing, MCP runs in `stateless` mode, sets `missing_session_id`, and returns `known_values_required_next_call` — Leaping must echo those known values on the next turn.

On the first verification MCP call, always pass `phone_lookup_found` from the real `get_customer_by_phone` result.

Pass `latest_customer_input` only as the customer's answer to the current verification question. Do not pass the customer's Anliegen, requested month, or general request text as `latest_customer_input`.

### Clone session-id smoke test (`pmb_debug_echo_session_only`)

For a one-call Leaping clone smoke test before wiring verification brains, expose only `pmb_debug_echo_session_only` in a Function node and bind:

| MCP argument | Leaping binding |
|---|---|
| `session_id` | `leaping_conversation_id_hex` |

This tool accepts **only** `session_id` — no `latest_customer_input`, PLZ, HNR, or birthday — so the Leaping LLM cannot hallucinate optional parameters.

Example response when binding works:

```json
{
  "ok": true,
  "received_session_id": "a1b2c3d4e5f6789012345678abcdef01",
  "session_id_received": true
}
```

Do **not** add this tool to production Marie. It is for clone MCP contract verification only.

The older `pmb_debug_echo_session` (with optional PLZ/HNR/bday fields) remains available for dashboard debugging but is **not** recommended in Leaping Function nodes — optional schema fields tend to get LLM-filled with garbage.

See `docs/leaping-clone-verification-prompt.md` for the rewritten Marie verification stage prompt aligned with the slim MCP controller contract.

Important: the MCP only reduces wrong-order decisions if it is used as a gatekeeper. If all native Leaping functions stay enabled in one large stage, Marie can still call functions in the wrong order. The safer setup is to restrict enabled native functions per clone stage so the clone can only execute the function that the MCP brain explicitly allows.

### Clone verification test guidance

Run the focused Leaping integration checks before merging clone-brain changes:

```bash
cd server
node --import tsx --test src/tools/verification-leaping-session-id.test.ts
node --import tsx --test src/tools/verification-brain-stress.test.ts
node --import tsx --test src/tools/verification-leaping-integration.test.ts
node --import tsx --test src/tools/verification-brain-scenarios.test.ts
SCENARIO_STRICT=1 node --import tsx --test src/tools/verification-brain-scenarios.test.ts
```

The stress harness (`verification-brain-stress.test.ts`) runs 40 ugly multi-turn sequences with stable session IDs — wrong answers, retries, path switches, and cross-brain noise. It fails CI when any scenario allows an illegal function, corrupts stored values, or picks the wrong final action.

The session-id contract file (`verification-leaping-session-id.test.ts`) covers:

- UUID-style `leaping_conversation_id` and hex-style `leaping_conversation_id_hex` as `session_id`
- same-hex persistence across PLZ → HNR → birthday, and isolation across different hex sessions
- stateless `missing_session_id` when `session_id` is absent
- per-call `call_...` IDs do not merge state
- `session_id_received`, exact `session_id` echo, and `known_values_required_next_call` in stateful vs stateless mode

The 20-test Leaping integration file covers:

- stable `leaping_conversation_id_hex`-style session persistence
- stateless fallback with `known_values_required_next_call`
- rejection of fake per-call `call_...` session IDs
- normalized `function_arguments` / `leaping_function_arguments`
- phone/VNR result normalization and cross-path address → VNR birthday reuse

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
