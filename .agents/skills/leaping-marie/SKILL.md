---
name: leaping-marie
description: >-
  Official Leaping AI voice agent platform (Studio, nodes, stages, transitions,
  fields, MCP servers, telephony, API) and Marie Pflegemittelbox clone integration.
  Use when building, prompting, debugging, or wiring Leaping agents, Function nodes,
  MCP tools, phone deployment, outbound, get/export calls, SSE chat, or Marie
  Kundenidentifizierung with pmb_verification_* brains.
---

# Leaping AI + Marie

Knowledge source: **16 official Leaping PDF exports** in `references/extracted/`.
Do not invent Leaping UI labels, API paths, or MCP behavior — read the matching extracted doc first.

## When to use this skill

- Leaping Studio: Agent Setup, Dialogue, Scripted, Function, Junction, Switch, Field setter, End
- MCP servers tab: discover tools, stage exposure, Function node = one MCP tool
- Prompting Marie clones (agent vs stage layers, pronunciation, transitions)
- Telephony, snapshots, publish/deploy phone numbers
- Leaping REST API: login, agents, calls, export, outbound SMS, SSE chat
- Pflegemittelbox MCP (`pmb_verification_*`) + Marie native functions

## Official doc index

| Topic | File |
|-------|------|
| Studio / node types | `references/extracted/agent-builder-studio.md` |
| Agent settings, fields, functions | `references/extracted/details.md` |
| MCP servers (critical) | `references/extracted/mcp-servers.md` |
| Prompting | `references/extracted/prompting-best-practices.md` |
| Telephony | `references/extracted/phone-numbers-telephony.md` |
| Create agent API | `references/extracted/create-agent.md` |
| Login API | `references/extracted/login.md` |
| Get calls API | `references/extracted/get-calls.md` |
| Export calls | `references/extracted/export-calls.md` |
| Outbound | `references/extracted/outbound.md` |
| Send outbound SMS | `references/extracted/send-outbound-sms.md` |
| SSE Chat | `references/extracted/sse-chat.md` |
| SSE Chat snapshot | `references/extracted/sse-chat-latest-snapshot.md` |
| Calls UI | `references/extracted/calls.md` |
| Home / dashboard | `references/extracted/home-area.md` |
| Phone deployment | `references/extracted/create-phone-deployment.md` |

Marie/MCP project overlay: `references/project-marie-mcp.md`

---

## Leaping Studio essentials

### Conversation model

- Conversations = **steps** (nodes) connected by **transitions** (plain-language conditions).
- **Fields** = typed variables (Real, Integer, Boolean, Text) with defaults; persist across the call.
- **Save** persists to DB; **Publish** makes changes testable (voice/text chat on the right).
- **Phone button** deploys published snapshot to an assigned number.
- Reserved fields use `leaping_` prefix (e.g. `leaping_conversation_id`, `leaping_conversation_id_hex`).

### Node types (when to use which)

| Node | Behavior |
|------|----------|
| **Agent Setup** | System message — loaded **every turn**. Keep short (<2k tokens). Role + tone only; not full scripts. |
| **Scripted** | Verbatim TTS — exact words spoken. Good for intro/outro/transfer preamble. |
| **Dialogue** | Plain-language job description; LLM decides wording. Native + MCP tools selectable. |
| **Function** | **Deterministic** — runs 100% of the time when reached. Native function **or** exactly **one** MCP tool (not both). |
| **Field setter** | Manually set field values (intent flags, voicemail `leaping_call_voicemail_detected`, etc.). |
| **Junction / Switch** | Route by field value; Switch has default case. |
| **Call Transfer** | Phone (+E.164) or SIP (INVITE/REFER). |
| **End** | Marks Completed; generates summary. |
| **Post conversation** | Runs after call ends (e.g. CRM summary). |

### Functions (native)

- Configure under **Configure → Functions** (API Call, Summarizer, Template, Wait, Send DTMF).
- In **Dialogue**: optional capability — agent decides when to call (referenced in prompt).
- In **Function node**: automatic execution — use for deterministic gates (MCP brains, lookups).

**Marie rule:** For verification, use **Function nodes** for MCP brain calls. Do not leave all CRM natives enabled on a large Dialogue stage — Marie will call them out of order.

---

## MCP servers (Leaping v1)

Source: `references/extracted/mcp-servers.md`

### Setup

1. Agent → **MCP Servers** tab → Add server
2. **Server URL** = remote **Streamable HTTP** endpoint (e.g. `https://mcp.example.com/mcp`)
3. Optional: **Tool Prefix**, **Bearer** or **Custom Header** auth (secrets encrypted at rest)
4. Click **Discover** → lists **Tools** and **Prompts** (resources not supported in v1)
5. Discovery cached on agent save; live tools at call time come from server

### Stage exposure

| Node type | MCP behavior |
|-----------|--------------|
| **Dialogue / Response** | Toggle which MCP tools agent **may** call (like native functions) |
| **Function** | Select **exactly one** MCP tool; bind args to fields/literals; unbound args filled by agent |

### MCP prompts as messages

- System message, stage message, or Scripted node can use **Use MCP prompt**
- Fallback chain: live server render → saved preview with `{{field}}` filled → hand-authored static text
- **Must** keep non-empty plain message as last-resort fallback (publish blocked otherwise)
- Field-bound args sent as literal `{{field_name}}` — server must passthrough-interpolate
- System message: resolved once at call start; field args re-evaluated each turn; **no LLM-extracted args** for system prompt

### Security / limits

- SSRF guard (no private/loopback/metadata IPs)
- Timeouts on connect/read/tool/prompt
- 256 KiB response cap
- Remote HTTP only (no stdio/local)
- Static auth only (no OAuth in v1)

### Pflegemittelbox MCP

- Leaping discovers via `POST /mcp/sse` → `tools/list` (Streamable HTTP)
- After deploy: disconnect/reconnect MCP in Leaping to refresh tools
- Brain tools return legacy controller JSON — see `references/project-marie-mcp.md`

---

## Prompting best practices (Leaping)

Source: `references/extracted/prompting-best-practices.md`

1. **Agent Setup < ~2,000 tokens** — loaded every step; long system prompts add latency.
2. **Pronunciation rules with examples** — PLZ digit-by-digit, emails comma-separated, birthdays spoken slowly.
3. **Name transitions/functions in prompt** — e.g. “call `call transfer` if customer wants human”.
4. **Steps + examples** — tell the model exactly what to do.
5. **CAPS for hard rules** — e.g. “DO NOT repeat the customer answer”.
6. **No LLM math/text-compare** — use functions for exact operations.
7. **Iterate continuously** after go-live.

### Marie prompt layering

| Layer | Content |
|-------|---------|
| **Agent Setup** | Personality, product overview, transfer rules, pronunciation — **not** verification logic |
| **Kundenident stage** | MCP executor only — see `references/project-marie-mcp.md` |
| **Other stages** | Anliegen, delivery, box change — after `transition_to: weiter` |

**Kundenident executor rules (Marie clone):**

- Do not verify yourself — only execute MCP output
- `allowed_to_call_function=true` → exact `function_to_call` + `function_arguments`
- `allowed_to_transition=true` → exact `transition_to`
- Else → exact `say` only (**empty = silence**, no filler)
- After native function → same brain again with result field; **omit stale `latest_customer_input`**
- Router phase: after method answer → `pmb_verification_method_router` again before brain

---

## API quick reference

Base: `https://api.leaping.ai/v1/`

| Endpoint | Purpose |
|----------|---------|
| `POST /login` | Form auth → `access_token` (Bearer on subsequent calls) |
| `POST /agents/` | Create agent (`name`, `deprecated_nodes_data`, `fields`, …) |
| `GET /calls/` | List calls (`agent_id`, filters, pagination) — see extracted doc |
| Export / outbound SMS / SSE chat | See respective `references/extracted/*.md` |

Always use `Authorization: Bearer YOUR_ACCESS_TOKEN`. Never commit credentials.

---

## Marie verification flow (Pflegemittelbox)

Full detail: `references/project-marie-mcp.md`

```
get_customer_by_phone
→ pmb_debug_echo_session_only (optional)
→ pmb_verification_method_router
→ phone | address | vnr brain
→ native ONLY when allowed_to_call_function=true
→ same brain + native result field
→ transition ONLY when allowed_to_transition=true
```

### Bindings

| MCP arg | Leaping field |
|---------|---------------|
| `session_id` | `leaping_conversation_id_hex` |
| `latest_customer_input` | current verification answer only |
| `id_phone` | after phone lookup |

### MCP response shape (stabilization branch)

`ok`, `method`, `next_action`, `allowed_to_call_function`, `function_to_call`,
`allowed_to_transition`, `transition_to`, `say`, `reason`, `missing_fields`, `safety_flags`

### Preflight

```bash
cd server && node --import tsx src/tools/verification-deployment-preflight.ts
```

---

## How to work as an agent

1. For Leaping platform questions → open the matching `references/extracted/*.md` first.
2. For Marie/MCP wiring → `references/project-marie-mcp.md` + repo `server/src/routes/mcp-http.ts`.
3. Prefer **Function nodes** over Dialogue tool freedom for deterministic flows.
4. When debugging “Marie disobeyed MCP” → check: slim MCP response?, wrong node type?, stale field bindings?, all natives enabled on stage?
5. Do not guess Leaping UI — cite extracted doc or say what’s missing.

## Install / regenerate

```bash
python3 scripts/ingest-leaping-pdfs.py      # after PDF updates
python3 scripts/build-leaping-marie-skill.py  # sync to .cursor / .codex
```

ChatGPT: upload `CHATGPT_KNOWLEDGE_PACK.md` — see `INSTALL.md`.
