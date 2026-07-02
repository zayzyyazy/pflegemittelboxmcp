import { logCall } from '../db.js';
import {
  coerceDeliveryStatusReasonerInput,
  runDeliveryStatusReasoner,
} from './delivery-status-reasoner.js';
import {
  coerceVerificationMethodRouterInput,
  runVerificationMethodRouter,
} from './verification-method-router.js';
import {
  coerceVerificationAddressBrainInput,
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import {
  toLeapingLegacyCoreResponse,
  toLoggedVerificationBrainResponse,
} from './verification-brain-response.js';
import { isLeapingVisibleMcpTool } from './mcp-leaping-tool-catalog.js';

export async function runLeapingMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!isLeapingVisibleMcpTool(name)) {
    throw new Error(
      `Tool "${name}" is not exposed to Leaping. Use the dashboard or REST API for internal tools.`
    );
  }

  const start = Date.now();

  switch (name) {
    case 'pmb_verification_method_router': {
      const input = coerceVerificationMethodRouterInput(args);
      const result = runVerificationMethodRouter(input);
      logCall(name, input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_verification_phone_brain': {
      const input = coerceVerificationPhoneBrainInput(args);
      const result = runVerificationPhoneBrain(input);
      logCall(name, input, toLoggedVerificationBrainResponse(result), null, Date.now() - start);
      return {
        content: [{ type: 'text', text: JSON.stringify(toLeapingLegacyCoreResponse(result), null, 2) }],
      };
    }

    case 'pmb_verification_address_brain': {
      const input = coerceVerificationAddressBrainInput(args);
      const result = runVerificationAddressBrain(input);
      logCall(name, input, toLoggedVerificationBrainResponse(result), null, Date.now() - start);
      return {
        content: [{ type: 'text', text: JSON.stringify(toLeapingLegacyCoreResponse(result), null, 2) }],
      };
    }

    case 'pmb_verification_vnr_brain': {
      const input = coerceVerificationVnrBrainInput(args);
      const result = runVerificationVnrBrain(input);
      logCall(name, input, toLoggedVerificationBrainResponse(result), null, Date.now() - start);
      return {
        content: [{ type: 'text', text: JSON.stringify(toLeapingLegacyCoreResponse(result), null, 2) }],
      };
    }

    case 'pmb_delivery_status_reasoner': {
      const input = coerceDeliveryStatusReasonerInput(args);
      const result = runDeliveryStatusReasoner(input);
      logCall(name, input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    default:
      throw new Error(`Unknown Leaping tool: "${name}"`);
  }
}
