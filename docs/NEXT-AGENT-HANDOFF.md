# Next agent handoff — Pflegemittelbox MCP + Marie + Leaping

**Last updated:** 2026-07-02  
**Repo:** `https://github.com/zayzyyazy/pflegemittelboxmcp`  
**User machine:** Mac (`~/pflegemittelboxmcp`), Leaping Marie clone, MCP at `https://leapingai-api.pflegemittelbox.de`

Paste this file (or attach it) at the start of a **local Mac Cursor** Agent chat. Invoke skill: `/leaping-marie`.

---

## 1. What this project is

**Pflegemittelbox MCP** is a Node.js MCP server + developer dashboard for **Marie** — a Leaping AI voice agent for Pflegemittelbox customer support (German).

Marie handles inbound calls: product questions, box changes, delivery status, **Kundenidentifizierung** (customer verification), transfers.

**MCP’s job:** deterministic “brains” that tell Marie **what to say**, **which native function to call**, and **when to transition** — so the LLM does not improvise verification or call CRM functions in the wrong order.

---

## 2. Where we are right now (July 2026)

### MCP server (production)

- URL: `https://leapingai-api.pflegemittelbox.de`
- Health: `curl https://leapingai-api.pflegemittelbox.de/health` → `ok: true`
- Leaping discovers tools via **Streamable HTTP**: `POST /mcp/sse` → `tools/list`
- Tool catalogue: `server/src/routes/mcp-http.ts` (`MCP_TOOLS`) — **not** only `mcp.ts`
- After deploy: **disconnect/reconnect MCP** in Leaping to refresh `tools/list`

### Git branches (important)

| Branch | PR | Role |
|--------|-----|------|
| `cursor/jun30-baseline-stabilization-6983` | [#2](https://github.com/zayzyyazy/pflegemittelboxmcp/pull/2) | **Deploy this for Marie verification** — legacy 11-field Leaping response, router, native VNR format check, sessions |
| `cursor/phase1-verification-hotfix-6983` | #1 | Older hotfix — slim controller output; **do not use** for Leaping obedience tests |
| `cursor/leaping-marie-skill-6983` | [#3](https://github.com/zayzyyazy/pflegemittelboxmcp/pull/3) | **leaping-marie agent skill** from 16 official Leaping PDFs + Marie overlay |
| `master` | — | Base branch |

**Production Marie MCP should run stabilization branch (#2), not phase1 hotfix.**

### leaping-marie skill (done)

- Built from **16 official Leaping AI PDF exports** (ingested to markdown)
- Canonical: `skills/leaping-marie/SKILL.md`
- Cursor discovery: `.agents/skills/leaping-marie/SKILL.md` (committed)
- ChatGPT: `skills/leaping-marie/CHATGPT_KNOWLEDGE_PACK.md`
- Export to Desktop: `bash scripts/export-skill-to-desktop.sh`

### Marie Leaping integration (~75% on VNR happy path)

**Works:** VNR confirm → format → lookup → birthday → `transition_to: weiter` when MCP gates followed.

**Still broken (Leaping-side, not MCP happy path):**

1. After user picks “Versichertennummer” — sometimes **no router/brain call**; Marie asks for VNR herself
2. Empty MCP `say` → Marie hallucinates filler (“OK, einen Moment”)
3. Stale `latest_customer_input: "ja"` on post-native brain calls (partially fixed in MCP `c1bf6b5`)
4. `Transitioned using False` — Leaping transition config / binding issue

**Fix priority:** Leaping prompt layering + Function nodes + field bindings — not more MCP happy-path logic.

---

## 3. Architecture — verification (good version)

### Flow

```
get_customer_by_phone
→ pmb_debug_echo_session_only (optional smoke test)
→ pmb_verification_method_router
→ pmb_verification_phone_brain | address_brain | vnr_brain
→ native Marie function ONLY when allowed_to_call_function=true
→ same brain again with native result field bound
→ transition ONLY when allowed_to_transition=true
```

### MCP tools (verification)

| Tool | Purpose |
|------|---------|
| `pmb_verification_method_router` | After intent; picks phone / address / vnr path |
| `pmb_verification_phone_brain` | Phone-found → birthday auth |
| `pmb_verification_address_brain` | PLZ + house number + birthday |
| `pmb_verification_vnr_brain` | VNR confirm → format → lookup → birthday |
| `pmb_debug_echo_session` / `pmb_debug_echo_session_only` | Clone debug — session_id binding |
| `normalize_vnr` / `pmb_normalize_vnr` | Spoken VNR normalization |

### Leaping bindings (critical)

| MCP argument | Leaping field |
|--------------|---------------|
| `session_id` | `leaping_conversation_id_hex` |
| `phone_lookup_found` | Explicit true/false from `get_customer_by_phone` (**preferred**) |
| `get_customer_by_phone_result` | Native function output (**best**) |
| `latest_customer_input` | Customer answer to **current verification question only** |
| `id_phone` | CRM customer id only — **not** call `$.id` / conversation hex |

### id_phone misbinding (discovered Jul 2026)

Leaping **Field Extractions** had `id_phone` → `$.id` on the call object (same as session/call id). MCP **no longer** treats 32-char hex `id_phone` as phone-found. Fix in Leaping: bind from `get_customer_by_phone` response, or use `phone_lookup_found`.
| `check_insurance_number_format_result` | After native format check |
| `get_customer_by_insurance_number_result` | After native lookup |
| `get_customer_by_plz_geb_result` | After address lookup |
| `check_birthday_result` / `check_birthday_error` | After birthday check |

**Never** use MCP `call_...` IDs as `session_id`.

**After native function:** call brain again with result field; **omit** stale `latest_customer_input`.

### MCP response shape (Jun 30 legacy — what Leaping expects)

11 core fields returned to Leaping:

```json
{
  "ok": true,
  "method": "vnr",
  "next_action": "ASK_BIRTHDAY",
  "allowed_to_call_function": false,
  "function_to_call": null,
  "allowed_to_transition": false,
  "transition_to": null,
  "say": "...",
  "reason": "...",
  "missing_fields": [],
  "safety_flags": []
}
```

Optional: `function_arguments`, `leaping_function_arguments`, `known_values_required_next_call`, `awaiting_field`.

**Regression to avoid:** commit `49c8267` slim-only output (`action_type` only) — Leaping clones stop obeying.

Implementation: `server/src/tools/verification-brain-response.ts` → `toLeapingLegacyCoreResponse()`.

### Native Marie functions (verification)

- `check_insurance_number_format`
- `get_customer_by_insurance_number`
- `get_customer_by_plz_geb`
- `check_birthday`
- `get_customer_by_phone` / `recognize_customer_by_phone` (greeting stage)

---

## 4. Kundenident stage — Marie prompt (executor only)

Marie must **not** verify herself. She only executes MCP output.

```
ZWEI PHASEN
- active_brain = null → pmb_verification_method_router
- active_brain gesetzt → dieses Brain

NACH METHODENANTWORT („Versichertennummer“)
1. Router mit latest_customer_input
2. Wenn next_brain + requires_followup_mcp_call → sofort next_brain (say leer = schweigen)
3. Dann Brain-Antwort sprechen

NACH NATIVER FUNKTION
- Brain nur mit session_id + Resultatfeld
- latest_customer_input NICHT mitschicken
- say leer → absolute Stille

MCP AUSFÜHREN
- allowed_to_call_function=true → exakt function_to_call + function_arguments
- allowed_to_transition=true → exakt transition_to
- sonst → exakt say

VERBOTEN
- selbst nach VNR/PLZ/Geburtstag fragen
- get_customer_* / check_* ohne MCP-Erlaubnis
- „erfolgreich identifiziert“ vor transition_to=weiter
- MCP-Text umformulieren
```

**Agent Setup** (global): personality, products, pronunciation — **not** verification logic.

**Use Function nodes** for MCP brain calls — not free-form LLM tool invocation on Dialogue stages with all CRM functions enabled.

---

## 5. Key code files

| File | Role |
|------|------|
| `server/src/routes/mcp-http.ts` | Leaping `tools/list` + `runTool` — **discovery path** |
| `server/src/mcp.ts` | Legacy SSE MCP registration |
| `server/src/tools/verification-method-brains.ts` | Phone / address / VNR brains + session state |
| `server/src/tools/verification-method-router.ts` | Method router |
| `server/src/tools/verification-brain-response.ts` | 11-field Leaping trim |
| `server/src/tools/leaping-field-bindings.ts` | `id_phone` → phone_lookup_found |
| `server/src/tools/verification-deployment-preflight.ts` | 21-step JSON scenario matrix |
| `server/src/dashboard/catalog.ts` | Dashboard tool runner (same 11-field shape) |
| `docs/STABILIZATION-COMPARISON.md` | PR #2 vs hotfix checklist |

---

## 6. Testing

```bash
cd server
npm test                                    # full suite (~114 tests)
node --import tsx src/tools/verification-deployment-preflight.ts   # 21/21 scenarios
node --import tsx --test src/tools/verification-leaping-integration.test.ts
```

Dashboard: `api.pflegemittelbox.de/ui/` — pass **arguments only**, not `{tool, arguments}` wrapper.

---

## 7. Deploy (company server)

```bash
cd /opt/pflegemittelboxmcp
git checkout cursor/jun30-baseline-stabilization-6983 && git pull
cd server && npm install && npm test && npm run build
node --import tsx src/tools/verification-deployment-preflight.ts
pm2 restart pflegemittelbox-mcp --update-env
```

Then in Leaping: disconnect/reconnect MCP server.

---

## 8. MCP fixes landed (stabilization branch)

- Router + debug echo in `mcp-http.ts` tools/list
- `session_id = leaping_conversation_id_hex`
- `id_phone` numeric customer id only — **not** call `$.id` (hex misbind breaks phone routing; MCP fixed)
- German birthday parsing (STT: “sechzen märz fünfzig”, etc.)
- Compact VNR `E207064360` → CONFIRM_VNR (not ASK_VNR loop)
- Native `check_insurance_number_format` in VNR flow
- Stale `ja` on format/lookup result turns ignored (`c1bf6b5`)
- 11-field Leaping response (not slim controller, not full 27-field debug)

---

## 9. leaping-marie skill — what was done

### Timeline

1. User provided 16 Leaping PDFs from `~/Documents`
2. Cloud agent could not read Mac paths — built ingest pipeline
3. User ran `mac-one-shot-skill-upload.sh` on Mac → PDFs + extracted markdown pushed
4. `SKILL.md` distilled from PDFs + `project-marie-mcp.md` overlay
5. Git pull conflicts with `.codex/` — fixed by gitignoring generated `.codex/` and `.cursor/`
6. Cursor could not find skill — fixed by committing `.agents/skills/leaping-marie/`

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/ingest-leaping-pdfs.py` | PDF → `references/extracted/*.md` |
| `scripts/build-leaping-marie-skill.py` | Build skill copies + CHATGPT pack |
| `scripts/install-leaping-marie-skill.sh` | Install to `.agents` / `.cursor` / `--global` |
| `scripts/export-skill-to-desktop.sh` | Copy bundle to `~/Desktop/leaping-marie-export` |
| `scripts/mac-one-shot-skill-upload.sh` | Mac: copy PDFs from Documents, ingest, push |

### Skill install (Mac Cursor)

```bash
cd ~/pflegemittelboxmcp
git pull origin cursor/leaping-marie-skill-6983
# File → Open Folder → this repo
# Cmd+Shift+P → Reload Window
# Agent chat → /leaping-marie
```

---

## 10. Open / next work

### Leaping (Marie clone) — highest impact

- [ ] Layer prompts: Agent global vs Kundenident MCP executor only
- [ ] Router call after method-choice answer
- [ ] Function nodes for all MCP brain calls
- [ ] Stage overrides: only needed natives + brains enabled on Kundenident
- [ ] Clear `latest_customer_input` binding on post-native brain turns
- [ ] Fix transition binding (`allowed_to_transition` → `transition_to`, not False)
- [ ] Empty `say` = enforced silence in stage prompt

### MCP / repo

- [ ] Merge PR #2 stabilization to production deploy path
- [ ] Merge PR #3 skill (or cherry-pick `skills/` + `.agents/skills/`)
- [ ] Test address + phone retry paths, failed birthday twice, `nicht_identifiziert`
- [ ] User artifacts: Leaping Function node screenshots, bindings per node, stage function overrides

### Not needed unless new bugs

- More VNR happy-path MCP logic (preflight green)
- Slim controller-only Leaping output
- Safe wrappers / `LEAPING_FUNC_*`

---

## 11. Leaping platform quick ref (from official PDFs)

Full text: `skills/leaping-marie/references/extracted/*.md`

- **Studio:** nodes (Agent Setup, Dialogue, Scripted, **Function**, Junction, Switch, End)
- **Function node:** deterministic — one native function **or** one MCP tool
- **Dialogue:** LLM chooses when to call enabled tools
- **MCP:** Streamable HTTP, Discover, stage opt-in, 256KiB cap, SSRF guard
- **Agent Setup:** keep < ~2000 tokens; loaded every turn
- **API base:** `https://api.leaping.ai/v1/` — login, agents, calls, SSE chat
- **Fields:** `leaping_conversation_id_hex` for stable session

---

## 12. Repos and URLs

| Item | URL / path |
|------|------------|
| GitHub repo | https://github.com/zayzyyazy/pflegemittelboxmcp |
| MCP health | https://leapingai-api.pflegemittelbox.de/health |
| MCP dashboard | https://api.pflegemittelbox.de/ui/ |
| PR #2 stabilization | https://github.com/zayzyyazy/pflegemittelboxmcp/pull/2 |
| PR #3 skill | https://github.com/zayzyyazy/pflegemittelboxmcp/pull/3 |
| Local repo (user) | `~/pflegemittelboxmcp` |
| Skill export | `bash scripts/export-skill-to-desktop.sh` → Desktop folder + zip |

---

## 13. Instructions for the next agent

1. Read this file + invoke `/leaping-marie` or read `skills/leaping-marie/SKILL.md`
2. For Marie verification: assume **PR #2 branch logic** on server; failures are usually **Leaping wiring/prompts**
3. Do not strip Leaping response fields to slim controller
4. Prefer Function nodes + MCP gate over Dialogue with all CRM tools enabled
5. Run preflight before claiming MCP is broken
6. User works on **Mac local Cursor** for Leaping Studio; use cloud agent for git/MCP code only
