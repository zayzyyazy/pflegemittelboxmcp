# Stabilization comparison: Jun 30 test window vs current hotfix branch

## Test window (corrected)

Good Leaping test calls: **June 30, 2026, ~14:56–15:32 CEST** (not 13:00).

| Git tag / branch | Commit | When | Role |
|---|---|---|---|
| `baseline/jun30-test-window-e17a823` | `e17a823` | 2026-06-30 14:25 CEST | Closest commit **before** test calls; first three-brain MCP tools |
| `cursor/jun30-baseline-stabilization-6983` | `58cf091` + minimal fixes | 2026-06-30 20:20 CEST base | **Stabilization branch** — last pre–slim-split legacy response + sessions |
| `snapshot/pre-rollback-6983-1910b1b` | `1910b1b` | 2026-07-01 | Preserved hotfix work (do not delete) |

## Architecture you described (good version)

Three **separate** MCP brains — Leaping picks path, brain is a state machine:

- `pmb_verification_phone_brain`
- `pmb_verification_address_brain`
- `pmb_verification_vnr_brain`

MCP returns **full legacy instruction object** to Leaping:

```json
{
  "ok": true,
  "method": "phone|address|vnr",
  "next_action": "ASK_BIRTHDAY",
  "allowed_to_call_function": false,
  "function_to_call": null,
  "allowed_to_transition": false,
  "transition_to": null,
  "say": "Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.",
  "reason": "...",
  "missing_fields": [],
  "safety_flags": []
}
```

Native Marie functions unchanged — MCP only decides **when** and **with which args**:

- `check_insurance_number_format`
- `get_customer_by_insurance_number`
- `get_customer_by_plz_geb`
- `check_birthday`

Session stores collected values; Leaping sends only `latest_customer_input` per turn.

## What broke Leaping obedience (current hotfix `1910b1b`)

### 1. Leaping-facing response stripped (commit `49c8267`, Jun 30 22:13 UTC)

**Before:** MCP tools returned the **full** brain result JSON (`JSON.stringify(result)`).

**After:** MCP tools return only `toLeapingVerificationBrainResponse()` → slim `controller`:

- `action_type`, `function_name`, `transition_name`
- **Removed from Leaping payload:** `next_action`, `allowed_to_call_function`, `function_to_call`, `allowed_to_transition`, `transition_to`, `reason`, `missing_fields`, `safety_flags`

Leaping clones wired to `allowed_to_call_function` / `function_to_call` / `transition_to` **stop receiving those fields**. This is the strongest explanation for “old version obeyed better.”

### 2. Slim input schemas (commit `c445556`)

Leaping tool schemas reduced to ~8 external fields; counters and internal state removed from schema. `check_insurance_number_format_result` later removed from Leaping schema (`06013c8`) — format moved internal.

### 3. Method router added (`c445556`)

`pmb_verification_method_router` required before dialogue. Good for path choice, but changes Leaping wiring vs direct three-brain calls during afternoon tests.

### 4. VNR flow complexity (Jul 1 commits)

Many patches on birthday-auth ordering, CRM sanitization, safe wrappers (later reverted in brains), misorder resilience — behavior harder to predict without legacy fields visible to Leaping.

## Side-by-side

| Area | Jun 30 afternoon (`58cf091` / stabilization) | Current hotfix (`1910b1b`) |
|---|---|---|
| Brain tools | 3 separate brains | 3 separate + router + safe wrappers (unused by brains) |
| Leaping MCP output | **Full legacy JSON** | **Slim controller only** |
| `next_action` visible to Leaping | Yes | No (debug/logs only) |
| `allowed_to_call_function` | Yes | No |
| `function_to_call` | Yes | Renamed `function_name` in slim layer |
| `allowed_to_transition` / `transition_to` | Yes | Renamed `transition_name` in slim layer |
| VNR format check | Native `check_insurance_number_format` | Internal validation (no native format call) |
| `session_id` | Yes | Yes |
| `id_phone` → phone found | Added on stabilization branch | Yes (`leaping-field-bindings`) |
| Birthday parsing (STT) | Added on stabilization branch | Yes |
| Safe CRM wrappers | No | Present in repo, not used by brains |

## Stabilization branch policy

Branch: `cursor/jun30-baseline-stabilization-6983` (PR #2)

**Keep:**

- Full legacy response to Leaping (no slim-only output)
- **Leaping-facing trim:** brains return core controller fields only (`next_action`, `allowed_to_call_function`, etc.) — same shape as Jun 30 afternoon test calls; `stored_values` / `attempts` stay in server logs only
- Three separate brains
- Native `check_insurance_number_format` in VNR flow
- Session state via `session_id` = `leaping_conversation_id_hex`
- `pmb_debug_echo_session` / `pmb_debug_echo_session_only` for session binding checks
- `pmb_verification_method_router` after intent, before method brain

**Minimal fixes only:**

- `id_phone` / customer id → `phone_lookup_found`
- VNR birthday required after lookup before `weiter`
- `check_birthday_result=true` → `TRANSITION_WEITER` / `transition_to: weiter`
- Spoken German birthday parsing (`sechzen märz fünfzig`, etc.)
- Smart retry when `check_birthday_result=false` without stored birthday

**Explicitly not on stabilization:**

- Slim controller-only Leaping output (`49c8267` regression)
- Safe wrappers / `LEAPING_FUNC_*`
- Broad schema expansion
- Large prompt rewrite

## PR #2 checklist (stabilization candidate)

| Check | PR #2 |
|---|---|
| Router registered (`pmb_verification_method_router`) | Yes |
| Router accepts/passes `session_id` | Yes |
| `id_phone = "107484"` → phone found | Yes |
| Debug echo tools registered | Yes |
| All method brains return full legacy JSON | Yes (`JSON.stringify(result)`) |
| Avoid `49c8267` slim output regression | Yes |
| VNR uses native `check_insurance_number_format` | Yes |
| VNR flow: lookup → birthday → `check_birthday` → `weiter` | Yes |
| Address path preserves values via `session_id` | Yes |
| No safe wrappers | Yes |

## Leaping node order for PR #2 testing

```
get_customer_by_phone
→ pmb_debug_echo_session_only   (confirm session_id, session_mode=session, id_phone if bound)
→ pmb_verification_method_router (after intent; id_phone → phone brain)
→ selected brain (phone / address / VNR)
→ native Marie functions ONLY when allowed_to_call_function=true
→ same brain again with native result field bound
→ transition ONLY when allowed_to_transition=true
```

Compare against hotfix PR #1 (`cursor/phase1-verification-hotfix-6983`) for birthday parsing and VNR retry behavior, but PR #2 is the serious stabilization candidate because it restores the legacy Leaping contract.

## Deploy stabilization branch

```bash
cd /opt/pflegemittelboxmcp
git fetch
git checkout cursor/jun30-baseline-stabilization-6983
git pull
cd server && npm install && npm test && npm run build
pm2 restart pflegemittelbox-mcp --update-env
```

**Leaping tool discovery:** Leaping uses Streamable HTTP (`POST /mcp/sse` → `tools/list`), which reads from `server/src/routes/mcp-http.ts` (`MCP_TOOLS`), not only `mcp.ts`. After deploy, disconnect and reconnect the MCP server in Leaping so `tools/list` refreshes.

## First Leaping test after stabilization deploy

Phone-found path: confirm MCP returns **legacy fields**, not only `action_type`:

1. `phone_lookup_found=true` or `id_phone=107484`
2. Call `pmb_verification_phone_brain`
3. Expect: `next_action=ASK_BIRTHDAY`, `allowed_to_call_function=false`, `allowed_to_transition=false`

VNR path: after lookup found, same legacy shape with `next_action=ASK_BIRTHDAY`, then `CALL_CHECK_BIRTHDAY` after spoken birthday.
