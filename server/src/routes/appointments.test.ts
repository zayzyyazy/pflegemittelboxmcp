import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { spawnSync } from 'node:child_process';
import { createAppointmentsRouter } from './appointments.js';

const secret = 'test-secret-"never-expose';
const config = {
  GOOGLE_APPOINTMENT_WEBAPP_URL: 'https://example.test/exec',
  GOOGLE_APPOINTMENT_API_SECRET: secret,
};
const booking = {
  customer_id: '107430', name: 'Test Kunde', phone: '+49123456789',
  date: '2026-09-28', time: '10:00', call_id: 'TEST-CALL', reason: 'Beratung',
};

test('startup config preserves the exact appointment environment names', () => {
  // A fresh process exercises import-time initialization without reading real
  // credentials or relying on config already cached by another test.
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { appConfig } = await import(${JSON.stringify(new URL('../config.ts', import.meta.url).href)});
    assert.ok(appConfig.GOOGLE_APPOINTMENT_WEBAPP_URL === process.env.GOOGLE_APPOINTMENT_WEBAPP_URL);
    assert.ok(appConfig.GOOGLE_APPOINTMENT_API_SECRET === process.env.GOOGLE_APPOINTMENT_API_SECRET);
  `], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      DOTENV_CONFIG_PATH: '/dev/null',
      ...config,
    },
  });
  assert.equal(result.status, 0, result.stderr);
});

async function withServer(app: express.Express, fn: (url: string) => Promise<void>) {
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

function bridge(fetchImpl: typeof fetch, overrides = config, timeoutMs = 15_000) {
  const app = express();
  app.use('/appointments', createAppointmentsRouter(overrides, { fetchImpl, timeoutMs }));
  return app;
}

function post(url: string, path: string, body: unknown) {
  return fetch(`${url}/appointments/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('forwards only permitted fields and server-owned secret/action for both routes', async () => {
  for (const [path, input, action, output] of [
    ['check', { date: booking.date }, 'check_available_slots', { ok: true, date: booking.date, available_slots: ['10:00'] }],
    ['create', booking, 'create_appointment', { ok: true, event_id: 'event-1', date: booking.date, time: booking.time }],
  ] as const) {
    const mockFetch: typeof fetch = async (url, init) => {
      assert.equal(url, config.GOOGLE_APPOINTMENT_WEBAPP_URL);
      assert.equal(init?.method, 'POST');
      assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
      assert.equal(init?.redirect, 'follow');
      assert.ok(init?.signal);
      assert.deepEqual(JSON.parse(String(init?.body)), { ...input, secret, action });
      return Response.json(output);
    };
    await withServer(bridge(mockFetch), async url => {
      const response = await post(url, path, { ...input, secret: 'attacker', action: 'wrong', extra: true });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), output);
    });
  }
});

test('validates required fields and JSON without calling upstream', async () => {
  await withServer(bridge(async () => { throw new Error('Must not call upstream'); }), async url => {
    for (const [path, input] of [
      ['check', {}], ['check', { date: 123 }], ['check', { date: 'tomorrow' }],
      ['create', { date: booking.date }], ['create', { ...booking, name: ' ' }],
      ['create', { ...booking, time: '25:00' }],
    ] as const) {
      assert.equal((await post(url, path, input)).status, 400);
    }
    for (const [body, status] of [['{', 400], [JSON.stringify({ data: 'x'.repeat(110_000) }), 413]] as const) {
      const response = await fetch(`${url}/appointments/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      assert.equal(response.status, status);
      assert.equal((await response.json()).ok, false);
    }
  });
});

test('missing configuration returns 503', async () => {
  await withServer(bridge(async () => { throw new Error('Must not call upstream'); }, {
    GOOGLE_APPOINTMENT_WEBAPP_URL: '', GOOGLE_APPOINTMENT_API_SECRET: '',
  }), async url => {
    assert.equal((await post(url, 'check', { date: booking.date })).status, 503);
  });
});

test('passes business errors through without duplicating scheduling rules', async () => {
  const output = { ok: false, error: 'Slot is no longer available' };
  await withServer(bridge(async () => Response.json(output)), async url => {
    const response = await post(url, 'create', { ...booking, date: '2026-09-27', time: '09:00' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), output);
  });
});

test('upstream HTTP/HTML/JSON/network errors and secret echoes produce safe JSON', async () => {
  for (const mockFetch of [
    async () => new Response(`<html>${secret}</html>`, { status: 401 }),
    async () => new Response('<html>Google login</html>'),
    async () => Response.json(null),
    async () => Response.json({ unexpected: true }),
    async () => Response.json({ ok: true, nested: { error: `echo: ${secret}` } }),
    async () => { throw new Error(secret); },
  ]) {
    await withServer(bridge(mockFetch), async url => {
      const response = await post(url, 'check', { date: booking.date });
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.ok(!JSON.stringify(body).includes('never-expose'));
      assert.ok(!JSON.stringify(body).includes('<html>'));
    });
  }
});

test('native fetch follows redirect and times out while reading the response body', async () => {
  const upstream = express();
  upstream.post('/exec', express.json(), (req, res) => {
    assert.equal(req.body.secret, secret);
    res.redirect(302, '/result');
  });
  upstream.get('/result', (_req, res) => res.json({ ok: true, available_slots: ['10:00'] }));
  upstream.post('/slow', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.write('{');
  });
  await withServer(upstream, async upstreamUrl => {
    await withServer(bridge(fetch, { ...config, GOOGLE_APPOINTMENT_WEBAPP_URL: `${upstreamUrl}/exec` }), async url => {
      const response = await post(url, 'check', { date: booking.date });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, available_slots: ['10:00'] });
    });
    await withServer(bridge(fetch, { ...config, GOOGLE_APPOINTMENT_WEBAPP_URL: `${upstreamUrl}/slow` }, 50), async url => {
      const response = await post(url, 'create', booking);
      assert.equal(response.status, 504);
      assert.deepEqual(await response.json(), { ok: false, error: 'Appointment service timed out.' });
    });
  });
});
