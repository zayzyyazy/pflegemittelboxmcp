# Deploy To Koyeb

This is the quickest backup path after Railway for getting the Pflegemittelbox MCP server online at a public HTTPS URL.

## Recommended Koyeb Setup

- Service type: `Web Service`
- Source: GitHub repository
- Root directory: `server`
- Build command: `npm install && npm run build`
- Run command: `npm start`
- Health check path: `/health`

Koyeb will provide HTTPS automatically.

## App Assumptions

- Server root: `server`
- Build: `npm run build`
- Start: `npm start`
- Health: `/health`
- MCP: `/mcp/sse`
- Port binding: uses `PORT`

## Required Environment Variables

Set these in Koyeb:

```text
NODE_ENV=production
ENV_LABEL=koyeb
```

Set this after Koyeb gives you the public domain:

```text
PUBLIC_BASE_URL=https://YOUR-KOYEB-APP.koyeb.app
```

Do not hardcode `PORT`. Koyeb injects it.

Optional alert-email variables:

```text
ALERT_EMAIL_PROVIDER=gmail
ALERT_EMAIL_FROM=your-email@gmail.com
ALERT_EMAIL_TO=your-email@gmail.com
ALERT_EMAIL_SUBJECT_PREFIX=[Pflegemittelbox Alert]
GMAIL_SMTP_USER=your-email@gmail.com
GMAIL_SMTP_APP_PASSWORD=your-app-password
```

## GitHub Deploy Steps

1. Push the repo to GitHub.
2. In Koyeb, click `Create Web Service`.
3. Select your GitHub repo.
4. Set `Root directory` to `server`.
5. Set `Build command` to:

```bash
npm install && npm run build
```

6. Set `Run command` to:

```bash
npm start
```

7. Add env vars:
   - `NODE_ENV=production`
   - `ENV_LABEL=koyeb`
8. Deploy once.
9. After Koyeb gives you the public app URL, set:
   - `PUBLIC_BASE_URL=https://YOUR-KOYEB-APP.koyeb.app`
10. Redeploy.

## Docker Option

If Koyeb gives you trouble with build detection, this repo also includes a simple Dockerfile in `server/Dockerfile`.

Use the same env vars and the same health path.

## Final URLs

Health:

```text
https://YOUR-KOYEB-APP.koyeb.app/health
```

Leaping MCP:

```text
https://YOUR-KOYEB-APP.koyeb.app/mcp/sse
```

## Quick Tests

Health:

```bash
curl https://YOUR-KOYEB-APP.koyeb.app/health
```

MCP endpoint:

```bash
curl -i https://YOUR-KOYEB-APP.koyeb.app/mcp/sse
```

## Troubleshooting

If the deploy fails on startup:

- Confirm `npm start` runs `node dist/index.js`
- Confirm the server listens on `process.env.PORT`
- Confirm `npm run build` creates `dist/index.js`

If health checks fail:

- Verify `/health` returns HTTP 200
- Verify `PUBLIC_BASE_URL` matches the Koyeb domain

If Leaping cannot connect:

- Use the full SSE URL ending in `/mcp/sse`
- Do not use `/health`
- Check Koyeb logs for startup or bind errors

## If Koyeb Still Blocks

Next stable option:

- Hetzner VPS
- Coolify on that VPS

That should be the next move, not another expiring trial platform.
