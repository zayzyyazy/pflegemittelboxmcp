# Company Server Deployment

This is the current recommended deployment path for Christopher / IT.

## Current runtime facts

- Node.js 22 LTS on the company server
- Public HTTPS handled by IT
- Health endpoint: `/health`
- Leaping MCP endpoint: `/mcp/sse`
- Internal dashboard UI: `/ui`
- MCP requests must authenticate
- Dashboard requests must authenticate
- No direct customer DB access
- Current network model: inbound HTTPS from Leaping and internal operators
- No active outbound API integrations required today

The server writes its own local SQLite log/settings file under `data/`, so persistent local storage should be available.

## Required environment variables

Use `server/.env.production.example` as the template:

```env
NODE_ENV=production
ENV_LABEL=company
PORT=3000
PUBLIC_BASE_URL=https://leapingai-api.pflegemittelbox.de
MCP_AUTH_ENABLED=true
MCP_AUTH_TYPE=bearer
MCP_AUTH_TOKEN=replace-with-a-long-random-secret
DASHBOARD_AUTH_ENABLED=true
DASHBOARD_AUTH_USERNAME=operator
DASHBOARD_AUTH_PASSWORD=replace-with-a-long-random-password
```

Custom-header auth is also supported:

```env
MCP_AUTH_ENABLED=true
MCP_AUTH_TYPE=header
MCP_AUTH_HEADER_NAME=X-MCP-API-Key
MCP_AUTH_HEADER_VALUE=replace-with-a-long-random-secret
DASHBOARD_AUTH_ENABLED=true
DASHBOARD_AUTH_USERNAME=operator
DASHBOARD_AUTH_PASSWORD=replace-with-a-long-random-password
```

## Dashboard build

From the `dashboard/` folder:

```bash
npm install
npm run build
```

This creates the static UI that the Node server serves from `/ui`.

## Native Node deployment

From the `server/` folder:

```bash
npm install
npm test
npm run build
npm start
```

## PM2 startup

From the `server/` folder:

```bash
pm2 start npm --name pflegemittelbox-mcp -- start
pm2 save
pm2 status
```

To restart after env changes:

```bash
pm2 restart pflegemittelbox-mcp --update-env
```

## Docker deployment

From the `server/` folder:

```bash
docker build -t pflegemittelbox-mcp .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e ENV_LABEL=company \
  -e PORT=3000 \
  -e PUBLIC_BASE_URL=https://leapingai-api.pflegemittelbox.de \
  -e MCP_AUTH_ENABLED=true \
  -e MCP_AUTH_TYPE=bearer \
  -e MCP_AUTH_TOKEN=replace-with-a-long-random-secret \
  pflegemittelbox-mcp
```

If the SQLite log/settings file should survive container replacement, mount persistent storage to `/app/data`.

Example:

```bash
docker run --rm -p 3000:3000 \
  -v /srv/pflegemittelbox-mcp/data:/app/data \
  -e NODE_ENV=production \
  -e ENV_LABEL=company \
  -e PORT=3000 \
  -e PUBLIC_BASE_URL=https://leapingai-api.pflegemittelbox.de \
  -e MCP_AUTH_ENABLED=true \
  -e MCP_AUTH_TYPE=bearer \
  -e MCP_AUTH_TOKEN=replace-with-a-long-random-secret \
  pflegemittelbox-mcp
```

## Smoke test

After deployment:

```bash
curl https://DOMAIN/health
```

Verify the dashboard is protected:

```bash
curl -I https://DOMAIN/ui
```

Expected: `401 Unauthorized`

Verify the MCP route is protected:

```bash
curl -i https://DOMAIN/mcp/sse
```

Expected: `401 Unauthorized`

Verify authenticated discovery:

```bash
curl -X POST https://DOMAIN/mcp/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Then in Leaping, add:

```text
https://DOMAIN/mcp/sse
```

Click `Discover` and confirm the tools appear.

Then open:

```text
https://DOMAIN/ui
```

Use the Basic Auth username/password from `DASHBOARD_AUTH_USERNAME` and `DASHBOARD_AUTH_PASSWORD`.

## Leaping authentication setup

Option A - Bearer token:

- Enable `Authentication`
- Choose `Bearer Token`
- Paste the same value as `MCP_AUTH_TOKEN`

Option B - Custom header:

- Enable `Authentication`
- Choose `Custom Header`
- Header name: `X-MCP-API-Key` (or your configured name)
- Header value: the same value as `MCP_AUTH_HEADER_VALUE`

## Current network note

- Required now: inbound HTTPS from Leaping to the MCP server
- Required now: inbound HTTPS from internal operators to `/ui` and `/api/dashboard/*`
- No active outbound API integrations are required today
- No direct DB access is required

## First deployment checklist

1. Clone the repository onto the company server.
2. Build the dashboard:

```bash
cd dashboard
npm install
npm run build
```

3. Go to `server/`.
4. Create `.env` from `server/.env.production.example`.
5. Fill in the production domain, MCP auth secret, and dashboard Basic Auth credentials.
6. Run:

```bash
npm install
npm test
npm run build
```

7. Start with PM2:

```bash
pm2 start npm --name pflegemittelbox-mcp -- start
pm2 save
```

8. Verify health:

```bash
curl https://leapingai-api.pflegemittelbox.de/health
```

9. Verify `/ui` prompts for Basic Auth and then loads successfully.
10. Verify unauthenticated MCP requests fail with `401`.
11. Verify authenticated `tools/list` succeeds.
12. In Leaping, configure `https://leapingai-api.pflegemittelbox.de/mcp/sse`.
13. Enable matching Bearer token or custom-header authentication in Leaping.
14. Click `Discover` and confirm the tool list appears.
