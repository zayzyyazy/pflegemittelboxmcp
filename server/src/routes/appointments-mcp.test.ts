import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { appConfig } from '../config.js';
import { createMcpServer } from '../mcp.js';
import { mcpRouter } from './mcp-http.js';

const realFetch = globalThis.fetch;
const secret = 'appointment-mcp-test-secret';
const booking = {
  customer_id: '107430', name: 'Test Kunde', phone: '+49123456789',
  date: '2026-09-28', time: '10:00', call_id: 'TEST-CALL', reason: 'Beratung',
};

type Rpc = (method: string, params?: Record<string, unknown>) => Promise<any>;
async function withMcp(kind: 'http' | 'sdk', fn: (rpc: Rpc) => Promise<void>) {
  if (kind === 'sdk') {
    const server = createMcpServer();
    const client = new Client({ name: 'appointment-tests', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await fn(async (method, params) => method === 'tools/list'
        ? client.listTools()
        : client.callTool(params as { name: string; arguments?: Record<string, unknown> }));
    } finally {
      await client.close();
      await server.close();
    }
    return;
  }
  const app = express();
  app.use('/mcp', mcpRouter);
  const server = await new Promise<import('node:http').Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp/sse`;
    await fn(async (method, params) => {
      const response = await realFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.error, undefined);
      return body.result;
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

for (const kind of ['http', 'sdk'] as const) {
  test(`${kind}: discovers and calls both appointment tools through the shared bridge`, async t => {
    const previous = { ...appConfig };
    t.after(() => Object.assign(appConfig, previous));
    appConfig.GOOGLE_APPOINTMENT_WEBAPP_URL = 'https://example.test/exec';
    appConfig.GOOGLE_APPOINTMENT_API_SECRET = secret;
    const requests: unknown[] = [];
    const results = [
      { ok: true, date: booking.date, available_slots: ['10:00', '10:30'] },
      { ok: true, event_id: 'test-event', date: booking.date, time: booking.time },
    ];
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, 'https://example.test/exec');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'follow');
      assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
      assert.ok(init.signal);
      requests.push(JSON.parse(String(init.body)));
      return Response.json(results[requests.length - 1]);
    });
    await withMcp(kind, async rpc => {
      const list = await rpc('tools/list');
      assert.ok(list.tools.some((tool: any) => tool.name === 'pmb_verification_phone_brain'));
      for (const [name, required] of [
        ['pmb_check_available_slots', ['date']],
        ['pmb_create_appointment', ['customer_id', 'name', 'phone', 'date', 'time']],
      ] as const) {
        const tool = list.tools.find((item: any) => item.name === name);
        assert.ok(tool);
        assert.deepEqual([...tool.inputSchema.required].sort(), [...required].sort());
        assert.equal(tool.inputSchema.properties.secret, undefined);
      }
      assert.ok(!JSON.stringify(list).includes(secret));
      for (const [i, name, args] of [
        [0, 'pmb_check_available_slots', { date: booking.date }],
        [1, 'pmb_create_appointment', booking],
      ] as const) {
        const result = await rpc('tools/call', { name, arguments: args });
        assert.equal(result.isError, false);
        assert.deepEqual(JSON.parse(result.content[0].text), results[i]);
        assert.deepEqual(result.structuredContent, results[i]);
        assert.ok(!JSON.stringify(result).includes(secret));
      }
    });
    assert.deepEqual(requests, [
      { date: booking.date, secret, action: 'check_available_slots' },
      { ...booking, secret, action: 'create_appointment' },
    ]);
  });

  test(`${kind}: invalid input, missing config, upstream errors and secret echoes stay safe`, async t => {
    const previous = { ...appConfig };
    t.after(() => Object.assign(appConfig, previous));
    appConfig.GOOGLE_APPOINTMENT_WEBAPP_URL = 'https://example.test/exec';
    appConfig.GOOGLE_APPOINTMENT_API_SECRET = secret;
    let calls = 0;
    let response = () => Response.json({ ok: false, error: 'Slot unavailable' });
    t.mock.method(globalThis, 'fetch', async () => { calls++; return response(); });
    await withMcp(kind, async rpc => {
      const invalid = await rpc('tools/call', { name: 'pmb_create_appointment', arguments: { date: booking.date } });
      assert.equal(invalid.isError, true);
      assert.equal(calls, 0);
      appConfig.GOOGLE_APPOINTMENT_API_SECRET = undefined;
      const missing = await rpc('tools/call', { name: 'pmb_check_available_slots', arguments: { date: booking.date } });
      assert.equal(missing.isError, true);
      assert.equal(JSON.parse(missing.content[0].text).error, 'Appointment service is not configured.');
      assert.equal(calls, 0);
      appConfig.GOOGLE_APPOINTMENT_API_SECRET = secret;
      for (const makeResponse of [
        () => Response.json({ ok: false, error: 'Slot unavailable' }),
        () => new Response('<html>Google error</html>', { status: 401 }),
        () => new Response('<html>Google login</html>'),
        () => Response.json({ ok: true, nested: { secret } }),
        () => { throw new Error(secret); },
      ]) {
        response = makeResponse;
        const result = await rpc('tools/call', { name: 'pmb_create_appointment', arguments: booking });
        assert.equal(result.isError, true);
        assert.equal(JSON.parse(result.content[0].text).ok, false);
        assert.deepEqual(result.structuredContent, JSON.parse(result.content[0].text));
        assert.ok(!JSON.stringify(result).includes(secret));
        assert.ok(!JSON.stringify(result).includes('<html>'));
      }
    });
  });
}
