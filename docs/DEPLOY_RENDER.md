# Deploy Pflegemittelbox MCP on Render

This guide deploys the `server/` app as an always-on Render web service.

## 1. Prepare the repo

The server must already pass:

```bash
cd server
npm test
npm run build
```

Render runs the compiled server with:

```bash
npm start
```

## 2. Create the Render service

1. Push this repository to GitHub.
2. In Render, click `New +` -> `Web Service`.
3. Connect the GitHub repository.
4. Use these settings:

   - Root Directory: `server`
   - Runtime: `Node`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Instance Type: choose any always-on plan for production

## 3. Environment variables

Set these in Render:

Required:

- `NODE_ENV=production`
- `ENV_LABEL=render`
- `PORT` is provided by Render automatically
- `PUBLIC_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com`
- `MCP_AUTH_ENABLED=true`
- `MCP_AUTH_TYPE=bearer` or `header`

Optional email alert variables:

- `ALERT_EMAIL_PROVIDER=gmail` or `resend`
- `ALERT_EMAIL_FROM=Pflegemittelbox Alerts <alerts@yourdomain.com>`
- `ALERT_EMAIL_TO=ops@yourdomain.com`
- `ALERT_EMAIL_SUBJECT_PREFIX=[Pflegemittelbox Production]`

If using Gmail:

- `GMAIL_SMTP_USER=your-account@gmail.com`
- `GMAIL_SMTP_APP_PASSWORD=your-app-password`

If using Resend:

- `RESEND_API_KEY=re_xxxxxxxxx`

If using Bearer auth for Leaping -> MCP:

- `MCP_AUTH_TOKEN=replace-with-a-long-random-secret`

If using Custom Header auth for Leaping -> MCP:

- `MCP_AUTH_HEADER_NAME=X-MCP-API-Key`
- `MCP_AUTH_HEADER_VALUE=replace-with-a-long-random-secret`

## 4. Health check URL

Use this as the Render health check:

```text
/health
```

Example full URL:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

Expected healthy response:

```json
{
  "ok": true,
  "service": "pflegemittelbox-mcp"
}
```

## 5. MCP URL

Expected public MCP endpoint:

```text
https://YOUR-RENDER-SERVICE.onrender.com/mcp/sse
```

Use that exact URL inside Leaping MCP server configuration.

## 6. Configure Leaping MCP authentication

Option A - Bearer Token:

1. In Leaping MCP Server settings, enable `Authentication`
2. Choose `Bearer Token`
3. Paste the same value used in `MCP_AUTH_TOKEN`

Leaping must then send:

```text
Authorization: Bearer YOUR_SECRET
```

Option B - Custom Header:

1. In Leaping MCP Server settings, enable `Authentication`
2. Choose `Custom Header`
3. Header name: `X-MCP-API-Key` (or your configured name)
4. Header value: same as `MCP_AUTH_HEADER_VALUE`

Leaping must then send:

```text
X-MCP-API-Key: YOUR_SECRET
```

## 7. Smoke test after deploy

Check:

```bash
curl https://YOUR-RENDER-SERVICE.onrender.com/health
```

Then check MCP discovery:

```bash
curl -X POST https://YOUR-RENDER-SERVICE.onrender.com/mcp/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

If you use header auth instead, replace the auth header with:

```bash
-H "X-MCP-API-Key: YOUR_SECRET"
```

Requests without valid auth should return:

```text
401 Unauthorized
```

## 8. Troubleshooting

If the service does not start:

- Check Render logs for `Invalid environment configuration`.
- Make sure `PUBLIC_BASE_URL` is a valid `https://...` URL.
- Make sure `PORT` is not hardcoded anywhere else.

If MCP discovery fails:

- Verify the MCP URL ends with `/mcp/sse`
- Confirm `/health` responds with `ok: true`
- Confirm the Render instance is not sleeping
- Confirm Leaping auth type matches the server auth type
- Confirm the shared secret matches exactly
- Confirm requests without the secret return `401`

If email alerts fail:

- For Gmail: verify `GMAIL_SMTP_USER` and `GMAIL_SMTP_APP_PASSWORD`
- For Resend: verify `RESEND_API_KEY`
- Confirm `ALERT_EMAIL_FROM` and `ALERT_EMAIL_TO` are set

If Leaping only shows some tools:

- Click `Discover` again
- Remove and re-add the MCP server entry if Leaping cached an older tool list

## 9. Production notes

- Keep production Marie unchanged until the clone/test agent is stable.
- Expose new MCP tools to a clone agent first.
- Use `pmb_verification_brain`, `pmb_delivery_status_reasoner`, and `pmb_post_call_alert_detector` in test stages before enabling them broadly.
- In production, do not deploy the MCP publicly without `MCP_AUTH_ENABLED=true`.
