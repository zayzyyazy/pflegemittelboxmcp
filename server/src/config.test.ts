import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';

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

  process.env = previous;
});

test('loadConfig rejects missing Gmail credentials when provider is gmail', () => {
  const previous = { ...process.env };
  process.env.PORT = '3001';
  process.env.ALERT_EMAIL_PROVIDER = 'gmail';
  process.env.ALERT_EMAIL_FROM = 'alerts@example.com';
  delete process.env.GMAIL_SMTP_USER;
  delete process.env.GMAIL_SMTP_APP_PASSWORD;

  assert.throws(() => loadConfig(), /GMAIL_SMTP_USER/);

  process.env = previous;
});
