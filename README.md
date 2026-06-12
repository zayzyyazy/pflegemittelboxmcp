# Pflegemittelbox MCP Tools

A local MCP (Model Context Protocol) server + developer dashboard for building and testing tools that can be connected to Leaping AI (Marie).

**Requirements:** Node.js 22.5+ (uses the built-in `node:sqlite` — no native compilation needed)

## What's in the box

| Part | What it does |
|------|--------------|
| `server/` | Express + TypeScript server that speaks MCP over SSE. Logs every tool call to SQLite. |
| `dashboard/` | React + Vite dashboard to list tools, test them, inspect logs, and manage settings. |

### Current MCP Tools

| Tool | Safe? | Description |
|------|-------|-------------|
| `normalize_vnr` | ✓ | Converts spoken German VNR text ("L wie Ludwig null drei...") to a clean candidate like `L039359923` |
| `health_check` | ✓ | Returns `{ ok: true }` — use this to verify Leaping can reach the server |

---

## Quick start

### 1. Install dependencies

```bash
cd /path/to/pflegemittelbox-mcp
npm install              # installs concurrently at root
npm run setup            # installs server + dashboard deps
```

Or manually:

```bash
cd server && npm install
cd ../dashboard && npm install
```

### 2. Configure environment

```bash
cd server
cp .env.example .env
# Edit .env if you want a different port or ENV_LABEL
```

### 3. Run everything

From the root directory:

```bash
npm run dev
```

This starts both:
- **MCP server** → `http://localhost:3001`
- **Dashboard** → `http://localhost:5173`

Or run them separately:

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd dashboard && npm run dev
```

---

## Dashboard pages

| Page | URL | Purpose |
|------|-----|---------|
| MCP Tools | `/` | List tools, run tests, see recent call history |
| Leaping Functions | `/leaping` | Reference table of all Marie/Leaping functions |
| Call Logs | `/logs` | Live log of every tool call (auto-refreshes every 3s) |
| Settings | `/settings` | Server URL, environment label, Leaping connection guide |

---

## Test the tools manually

### normalize_vnr

```bash
curl -X POST http://localhost:3001/api/tools/normalize_vnr/test \
  -H "Content-Type: application/json" \
  -d '{"text": "L wie Ludwig null drei neun drei fünf neun neun zwei drei"}'
```

Expected:
```json
{
  "output": {
    "candidate": "L039359923",
    "valid_shape": true,
    "confidence": "high",
    "notes": "Extracted L from phonetic \"wie\" pattern. Converted German number words to digits."
  },
  "duration_ms": 1
}
```

### health_check

```bash
curl -X POST http://localhost:3001/api/tools/health_check/test \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected:
```json
{ "output": { "ok": true, "service": "pflegemittelbox-mcp", "version": "0.1.0" }, "duration_ms": 0 }
```

### MCP SSE endpoint (for Leaping)

```
GET http://localhost:3001/mcp/sse
```

---

## Connecting to Leaping

1. **Run the server locally** (`npm run dev` in `server/`)
2. **Expose it publicly** — pick one:

   ```bash
   # ngrok (easiest)
   ngrok http 3001

   # Cloudflare Tunnel
   cloudflared tunnel --url http://localhost:3001
   ```

3. **Copy the public URL** — e.g. `https://abc123.ngrok-free.app`
4. In **Leaping → your agent → MCP Servers → Add**
5. Paste: `https://abc123.ngrok-free.app/mcp/sse`
6. Click **Discover** — Leaping will find `health_check` and `normalize_vnr`
7. Test `health_check` first to confirm the connection works
8. Add `normalize_vnr` to the relevant stage where Marie captures the VNR

> The Settings page in the dashboard has this guide as well.

---

## Adding more tools later

To add a new tool:

1. Create `server/src/tools/your-tool.ts` with the pure logic function
2. Register it in `server/src/mcp.ts` using `mcpServer.tool(...)`
3. Add a test case to `server/src/routes/api.ts` in the `/tools/:name/test` switch
4. Add the definition to `TOOL_DEFS` in the same file (dashboard picks it up automatically)

**Suggested next tools** (safe, read-only):
- `verify_vnr_format` — thin wrapper around `check_insurance_number_format`
- `lookup_customer` — calls `get_customer_by_insurance_number` (needs real API creds)
- `verify_birthday` — calls `check_birthday`

**Do NOT add** production-changing functions (phone save, ticket create) until you have:
- A confirmation step in the flow
- Clear logging
- A kill switch / feature flag

---

## Project structure

```
pflegemittelbox-mcp/
├── package.json          ← root: npm run dev starts both
├── README.md
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              ← Express entry point
│       ├── db.ts                 ← SQLite (logs + settings)
│       ├── mcp.ts                ← MCP server + tool registration
│       ├── tools/
│       │   └── normalize-vnr.ts  ← VNR normalization logic
│       └── routes/
│           ├── api.ts            ← REST API for dashboard
│           └── mcp-http.ts       ← /mcp/sse + /mcp/messages
└── dashboard/
    ├── index.html
    ├── vite.config.ts            ← proxies /api and /mcp to :3001
    └── src/
        ├── App.tsx               ← sidebar + routing
        ├── api.ts                ← fetch helpers
        ├── types.ts              ← shared TypeScript types
        ├── index.css             ← all styles (no framework)
        └── pages/
            ├── ToolsPage.tsx
            ├── LeapingFunctionsPage.tsx
            ├── LogsPage.tsx
            └── SettingsPage.tsx
```

---

## Security notes

- The server is **local-only** by default. It binds to `localhost:3001`.
- No real Pflegemittelbox API keys are used or needed yet.
- All secrets go in `server/.env` — this file is in `.gitignore`.
- When you later add real API credentials, they live **only** in `.env` and are never sent to the dashboard frontend.
- Production-changing tools are clearly marked in the Leaping Functions reference page.
