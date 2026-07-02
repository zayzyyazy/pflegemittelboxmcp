/**
 * Verifies the COMPILED dist bundle PM2 actually runs — not tsx source.
 * Usage (after npm run build): node scripts/verify-deploy.mjs
 */
import { runVerificationAddressBrain } from '../dist/tools/verification-method-brains.js';
import { toLeapingLegacyCoreResponse } from '../dist/tools/verification-brain-response.js';
import { MCP_VERIFICATION_BUILD_ID } from '../dist/tools/verification-build-info.js';

function fail(message) {
  console.error(`verify-deploy FAIL: ${message}`);
  process.exit(1);
}

if (!MCP_VERIFICATION_BUILD_ID) {
  fail('MCP_VERIFICATION_BUILD_ID missing from dist — run npm run build');
}

const sessionId = 'verify-deploy-handoff';
const rebound = toLeapingLegacyCoreResponse(
  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'über die Postleitzahl',
    phone_lookup_found: false,
  })
);

if (rebound.mcp_build_id !== MCP_VERIFICATION_BUILD_ID) {
  fail(`mcp_build_id mismatch: ${rebound.mcp_build_id} !== ${MCP_VERIFICATION_BUILD_ID}`);
}
if (!Array.isArray(rebound.safety_flags) || !rebound.safety_flags.includes('address_method_choice')) {
  fail(`expected address_method_choice for "über die Postleitzahl", got ${JSON.stringify(rebound)}`);
}
if (!String(rebound.say ?? '').includes('Gerne über die Postleitzahl')) {
  fail(`expected friendly PLZ prompt, got say=${JSON.stringify(rebound.say)}`);
}

console.log(`verify-deploy OK (dist) build=${MCP_VERIFICATION_BUILD_ID}`);
console.log(`  say: ${rebound.say}`);
