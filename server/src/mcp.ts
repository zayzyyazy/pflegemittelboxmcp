/**
 * MCP server factory.
 *
 * Do NOT export a singleton McpServer. The SDK's internal Protocol class throws
 * "Already connected to a transport" if connect() is called on the same instance
 * twice. Always call createMcpServer() to get a fresh instance per connection.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { normalizeVnr } from './tools/normalize-vnr.js';
import { logCall } from './db.js';

// Active legacy SSE sessions — used by POST /mcp/messages
export const sseTransports: Record<string, SSEServerTransport> = {};

/**
 * Create a fresh McpServer with all tools registered.
 * One instance per SSE connection; discard after the connection closes.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'pflegemittelbox-mcp',
    version: '0.1.0',
  });

  server.tool(
    'normalize_vnr',
    'Normalize messy spoken German VNR / insurance number text into a clean candidate. ' +
      'VNR format: 1 Latin letter + 9 digits (e.g. L039359923). ' +
      'Understands phonetic forms ("L wie Ludwig") and German number words.',
    {
      text: z
        .string()
        .describe(
          'German spoken VNR text, e.g. "L wie Ludwig null drei neun drei fünf neun neun zwei drei"'
        ),
    },
    async ({ text }) => {
      const start = Date.now();
      const result = normalizeVnr(text);
      logCall('normalize_vnr', { text }, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'health_check',
    'Returns service health status. Use this to verify the MCP server is reachable from Leaping.',
    async () => {
      const result = { ok: true, service: 'pflegemittelbox-mcp', version: '0.1.0' };
      logCall('health_check', {}, result, null, 0);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  return server;
}
