# Marie + Pflegemittelbox MCP (project-specific)

This file is **not** from Leaping PDFs. It documents how **this repo** connects to Marie clones.

## MCP server

- Leaping discovers tools via Streamable HTTP: `POST /mcp/sse` → `tools/list`
- Tool catalogue lives in `server/src/routes/mcp-http.ts` (`MCP_TOOLS`), not only `mcp.ts`
- After deploy: disconnect/reconnect MCP in Leaping to refresh `tools/list`

## Stable session binding

| MCP argument | Leaping binding |
|---|---|
| `session_id` | `leaping_conversation_id_hex` |
| `latest_customer_input` | customer answer to **current verification question only** |
| `id_phone` / `phone_lookup_found` | after `get_customer_by_phone` |

Never use MCP `call_...` IDs as `session_id`.

## Verification flow (clone)

```
get_customer_by_phone
→ pmb_debug_echo_session_only (optional)
→ pmb_verification_method_router
→ phone | address | vnr brain
→ native function ONLY when allowed_to_call_function=true
→ same brain again with native result field
→ transition ONLY when allowed_to_transition=true
```

### Router vs brain phases

- `active_brain = null` → call `pmb_verification_method_router`
- After customer picks method (e.g. „Versichertennummer“) → **router again** with `latest_customer_input`
- When router returns `next_brain` + `requires_followup_mcp_call` → call that brain immediately (`say` may be empty = silence)

### MCP response shape (Jun 30 legacy contract)

Leaping expects these fields on brain tools:

`ok`, `method`, `next_action`, `allowed_to_call_function`, `function_to_call`,
`allowed_to_transition`, `transition_to`, `say`, `reason`, `missing_fields`, `safety_flags`

### Native Marie functions (verification)

- `check_insurance_number_format`
- `get_customer_by_insurance_number`
- `get_customer_by_plz_geb`
- `check_birthday`

### Kundenident stage prompt (executor only)

Marie must **not** verify herself. She only executes MCP output:

- `allowed_to_call_function=true` → call exact `function_to_call` + `function_arguments`
- `allowed_to_transition=true` → exact `transition_to`
- else → speak exact `say` only (empty = absolute silence, no filler)
- After native function: brain again **without** stale `latest_customer_input`

### Preflight before Leaping tests

```bash
cd server
node --import tsx src/tools/verification-deployment-preflight.ts
```

Branch: `cursor/jun30-baseline-stabilization-6983` (PR #2 stabilization).
