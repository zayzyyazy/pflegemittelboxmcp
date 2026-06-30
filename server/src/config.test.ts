import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';

function resetEnv(previous: NodeJS.ProcessEnv) {
  process.env = previous;
}

test('loadConfig accepts valid gmail email settings', () => {
  const previous = { ...process.env };
  process.env.PORT = '3001';
  process.env.NODE_ENV = 'production';
  process.env.ENV_LABEL = 'render';
  process.env.ALERT_EMAIL_PROVIDER = 'gmail';
  process.env.ALERT_EMAIL_FROM = 'alerts@example.com';
  process.env.GMAIL_SMTP_USER = 'alerts@example.com';
  process.env.GMAIL_SMTP_APP_PASSWORD = 'secret';

  const config = loadConfig();
  assert.equal(config.PORT, 3001);
  assert.equal(config.ALERT_EMAIL_PROVIDER, 'gmail');

  resetEnv(previous);
});

test('loadConfig rejects missing Gmail credentials when provider is gmail', () => {
  const previous = { ...process.env };
  process.env.PORT = '3001';
  process.env.ALERT_EMAIL_PROVIDER = 'gmail';
  process.env.ALERT_EMAIL_FROM = 'alerts@example.com';
  delete process.env.GMAIL_SMTP_USER;
  delete process.env.GMAIL_SMTP_APP_PASSWORD;

  assert.throws(() => loadConfig(), /GMAIL_SMTP_USER/);

  resetEnv(previous);
});

test('loadConfig rejects production startup when MCP auth is disabled', () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.MCP_AUTH_ENABLED = 'false';

  assert.throws(() => loadConfig(), /MCP_AUTH_ENABLED must be true in production/i);

  resetEnv(previous);
});

test('loadConfig rejects incomplete bearer auth config', () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.MCP_AUTH_ENABLED = 'true';
  process.env.MCP_AUTH_TYPE = 'bearer';
  delete process.env.MCP_AUTH_TOKEN;

  assert.throws(() => loadConfig(), /MCP_AUTH_TOKEN is required/i);

  resetEnv(previous);
});

test('loadConfig rejects incomplete header auth config', () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.MCP_AUTH_ENABLED = 'true';
  process.env.MCP_AUTH_TYPE = 'header';
  delete process.env.MCP_AUTH_HEADER_NAME;
  delete process.env.MCP_AUTH_HEADER_VALUE;

  assert.throws(() => loadConfig(), /MCP_AUTH_HEADER_NAME is required/i);

  resetEnv(previous);
});
