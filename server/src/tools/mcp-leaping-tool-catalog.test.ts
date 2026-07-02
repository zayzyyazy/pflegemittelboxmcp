import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLeapingVisibleMcpTool,
  LEAPING_MCP_TOOL_NAMES,
  LEAPING_MCP_TOOLS,
} from './mcp-leaping-tool-catalog.js';

test('Leaping MCP catalog exposes only Marie production tools', () => {
  assert.deepEqual(LEAPING_MCP_TOOL_NAMES, [
    'pmb_verification_method_router',
    'pmb_verification_phone_brain',
    'pmb_verification_address_brain',
    'pmb_verification_vnr_brain',
    'pmb_delivery_status_reasoner',
    'pmb_post_call_email_notifier',
  ]);
  assert.equal(LEAPING_MCP_TOOLS.length, LEAPING_MCP_TOOL_NAMES.length);
  assert.deepEqual(
    LEAPING_MCP_TOOLS.map((tool) => tool.name),
    [...LEAPING_MCP_TOOL_NAMES]
  );
});

test('post-call email notifier is Leaping-visible', () => {
  assert.equal(isLeapingVisibleMcpTool('pmb_post_call_email_notifier'), true);
});

test('legacy and internal tools are not Leaping-visible', () => {
  const hidden = [
    'normalize_vnr',
    'pmb_normalize_vnr',
    'pmb_address_verification_guardrail',
    'pmb_debug_echo_session',
    'pmb_debug_echo_session_only',
    'pmb_verification_brain',
    'pmb_post_call_alert_detector',
    'pmb_health_check',
    'health_check',
  ];
  for (const name of hidden) {
    assert.equal(isLeapingVisibleMcpTool(name), false, `${name} should be hidden`);
  }
});
