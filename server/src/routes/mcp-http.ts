/**
 * MCP HTTP transport endpoints.
 *
 * Supports two transports on the same /mcp/sse path:
 *
 *   GET  /mcp/sse      — Legacy SSE transport (old MCP protocol, kept for compat)
 *   POST /mcp/sse      — Streamable HTTP transport (MCP spec 2024-11-05, what Leaping uses)
 *   POST /mcp/messages — SSE session message handler (legacy, raw body required)
 *
 * How Leaping discovery works (Streamable HTTP):
 *   1. POST /mcp/sse  { method: "initialize", ... }
 *   2. POST /mcp/sse  { method: "notifications/initialized" }  → 202
 *   3. POST /mcp/sse  { method: "tools/list" }
 *   4. POST /mcp/sse  { method: "tools/call", params: { name, arguments } }
 */
import express, { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer, sseTransports } from '../mcp.js';
import { normalizeVnr } from '../tools/normalize-vnr.js';
import { logCall } from '../db.js';

export const mcpRouter = Router();

// ── Shared tool catalogue (single source of truth for Streamable HTTP) ────
const MCP_TOOLS = [
  {
    name: 'normalize_vnr',
    description:
      'Normalize messy spoken German VNR / insurance number text into a clean candidate. ' +
      'VNR format: 1 Latin letter + 9 digits (e.g. L039359923). ' +
      'Handles phonetic forms ("L wie Ludwig") and German number words.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description:
            'German spoken VNR text, e.g. "L wie Ludwig null drei neun drei fünf neun neun zwei drei"',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'health_check',
    description:
      'Returns service health status. Use to verify the MCP server is reachable from Leaping.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ── Shared tool runner ─────────────────────────────────────────────────────
async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const start = Date.now();

  switch (name) {
    case 'normalize_vnr': {
      const text = args.text;
      if (typeof text !== 'string' || !text.trim())
        throw new Error('"text" (non-empty string) is required');
      const result = normalizeVnr(text);
      logCall('normalize_vnr', { text }, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'health_check': {
      const result = { ok: true, service: 'pflegemittelbox-mcp', version: '0.1.0' };
      logCall('health_check', {}, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    default:
      throw new Error(`Unknown tool: "${name}"`);
  }
}

// ── POST /mcp/sse — Streamable HTTP transport (Leaping) ───────────────────
// express.json() is applied inline only here so /mcp/messages still gets
// the raw stream that SSEServerTransport needs.
mcpRouter.post('/sse', express.json(), async (req: Request, res: Response) => {
  // ── 1. Log the full incoming request ──────────────────────────────────
  const body = req.body as {
    jsonrpc?: string;
    method?: string;
    id?: string | number;
    params?: unknown;
  };

  console.log(
    '\n[MCP ▶] POST /mcp/sse',
    JSON.stringify(
      {
        method: body?.method ?? '(missing)',
        id: body?.id ?? null,
        headers: {
          'content-type': req.headers['content-type'],
          accept: req.headers['accept'],
          'mcp-session-id': req.headers['mcp-session-id'],
          'user-agent': req.headers['user-agent'],
        },
        body,
      },
      null,
      2
    )
  );

  if (!body || typeof body.method !== 'string') {
    console.log('[MCP ◀] 400 — invalid or missing JSON-RPC body');
    res.status(400).json({ error: 'Missing or invalid JSON-RPC body' });
    return;
  }

  const { method, id, params } = body;

  // ── 2. Notifications: 202, no response body ────────────────────────────
  // Notifications have no "id" field per JSON-RPC spec.
  if (id === undefined || id === null || method.startsWith('notifications/')) {
    console.log(`[MCP ◀] 202 — notification "${method}"`);
    logCall(`mcp:${method}`, params ?? {}, null, null, 0);
    res.status(202).end();
    return;
  }

  // ── 3. Requests: dispatch by method ───────────────────────────────────
  try {
    let result: unknown;

    switch (method) {
      case 'initialize': {
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'pflegemittelbox-mcp', version: '0.1.0' },
        };
        break;
      }

      case 'tools/list': {
        result = { tools: MCP_TOOLS };
        break;
      }

      case 'tools/call': {
        const p = params as { name?: string; arguments?: Record<string, unknown> };
        if (!p?.name) throw new Error('"params.name" is required for tools/call');
        result = await runTool(p.name, p.arguments ?? {});
        break;
      }

      case 'ping': {
        result = {};
        break;
      }

      default: {
        const errResp = {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: "${method}"` },
        };
        console.log('[MCP ◀] 200 (method-not-found):', JSON.stringify(errResp));
        logCall(`mcp:${method}`, params ?? {}, null, `Method not found: ${method}`, 0);
        res.status(200).json(errResp);
        return;
      }
    }

    logCall(`mcp:${method}`, params ?? {}, result, null, 0);

    const response = { jsonrpc: '2.0', id, result };
    console.log('[MCP ◀] 200:', JSON.stringify(response, null, 2));
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errResp = { jsonrpc: '2.0', id, error: { code: -32603, message } };
    console.error('[MCP ◀] 200 (error):', message);
    logCall(`mcp:${method}`, params ?? {}, null, message, 0);
    res.status(200).json(errResp);
  }
});

// ── GET /mcp/sse — Legacy SSE transport (kept for backward compat) ─────────
// A fresh McpServer is created per connection so that repeated GET requests
// (e.g. reconnects or multiple Discover clicks) never hit the same instance.
mcpRouter.get('/sse', async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport('/mcp/messages', res);
  const server = createMcpServer(); // one instance per connection lifetime

  sseTransports[transport.sessionId] = transport;

  res.on('close', () => {
    delete sseTransports[transport.sessionId];
    server.close().catch(() => {}); // detach transport → allow GC
  });

  await server.connect(transport);
});

// ── POST /mcp/messages — SSE session message handler (legacy) ─────────────
// MUST come before any express.json() in the app to keep raw body stream intact.
mcpRouter.post('/messages', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports[sessionId];

  if (!transport) {
    res.status(400).json({ error: `No active SSE session for sessionId: ${sessionId}` });
    return;
  }

  await transport.handlePostMessage(req, res);
});
