import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createMcpAuthMiddleware } from './mcp-auth.js';
import type { AppConfig } from './config.js';

function baseConfig(): AppConfig {
  return {
    PORT: 3001,
    NODE_ENV: 'development',
    ENV_LABEL: 'local',
    PUBLIC_BASE_URL: 'http://localhost:3001',
    MCP_AUTH_ENABLED: false,
    MCP_AUTH_TYPE: undefined,
    MCP_AUTH_TOKEN: undefined,
    MCP_AUTH_HEADER_NAME: undefined,
    MCP_AUTH_HEADER_VALUE: undefined,
    POST_CALL_MONITOR_ENABLED: false,
    POST_CALL_MONITOR_INTERVAL_SECONDS: 60,
    POST_CALL_MONITOR_LOOKBACK_MINUTES: 15,
    POST_CALL_MONITOR_FETCH_LIMIT: 100,
    LEAPING_API_BASE_URL: 'https://api.leaping.ai/v1',
    LEAPING_API_USERNAME: undefined,
    LEAPING_API_PASSWORD: undefined,
    LEAPING_API_CLIENT_ID: undefined,
    LEAPING_API_CLIENT_SECRET: undefined,
    LEAPING_AGENT_ID: undefined,
    ALERT_EMAIL_PROVIDER: undefined,
    ALERT_EMAIL_FROM: undefined,
    ALERT_EMAIL_TO: undefined,
    ALERT_EMAIL_SUBJECT_PREFIX: undefined,
    ALERT_EMAIL_LLM_ENABLED: false,
    RESEND_API_KEY: undefined,
    GMAIL_SMTP_USER: undefined,
    GMAIL_SMTP_APP_PASSWORD: undefined,
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL: 'gpt-4.1-mini',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
  };
}

async function withServer(
  config: AppConfig,
  fn: (baseUrl: string) => Promise<void>
) {
  const app = express();
  app.use('/mcp', createMcpAuthMiddleware(config));
  app.get('/mcp/sse', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  try {
    const address = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('auth disabled in dev allows MCP request', async () => {
  await withServer(baseConfig(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mcp/sse`);
    assert.equal(response.status, 200);
  });
});

test('bearer auth allows correct token', async () => {
  await withServer(
    {
      ...baseConfig(),
      MCP_AUTH_ENABLED: true,
      MCP_AUTH_TYPE: 'bearer',
      MCP_AUTH_TOKEN: 'secret-token',
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp/sse`, {
        headers: {
          Authorization: 'Bearer secret-token',
        },
      });
      assert.equal(response.status, 200);
    }
  );
});

test('bearer auth rejects wrong or missing token', async () => {
  await withServer(
    {
      ...baseConfig(),
      MCP_AUTH_ENABLED: true,
      MCP_AUTH_TYPE: 'bearer',
      MCP_AUTH_TOKEN: 'secret-token',
    },
    async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/mcp/sse`);
      assert.equal(missing.status, 401);

      const wrong = await fetch(`${baseUrl}/mcp/sse`, {
        headers: {
          Authorization: 'Bearer wrong-token',
        },
      });
      assert.equal(wrong.status, 401);
    }
  );
});

test('custom header auth allows correct value', async () => {
  await withServer(
    {
      ...baseConfig(),
      MCP_AUTH_ENABLED: true,
      MCP_AUTH_TYPE: 'header',
      MCP_AUTH_HEADER_NAME: 'X-MCP-API-Key',
      MCP_AUTH_HEADER_VALUE: 'header-secret',
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp/sse`, {
        headers: {
          'X-MCP-API-Key': 'header-secret',
        },
      });
      assert.equal(response.status, 200);
    }
  );
});

test('custom header auth rejects wrong or missing value', async () => {
  await withServer(
    {
      ...baseConfig(),
      MCP_AUTH_ENABLED: true,
      MCP_AUTH_TYPE: 'header',
      MCP_AUTH_HEADER_NAME: 'X-MCP-API-Key',
      MCP_AUTH_HEADER_VALUE: 'header-secret',
    },
    async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/mcp/sse`);
      assert.equal(missing.status, 401);

      const wrong = await fetch(`${baseUrl}/mcp/sse`, {
        headers: {
          'X-MCP-API-Key': 'wrong-secret',
        },
      });
      assert.equal(wrong.status, 401);
    }
  );
});
