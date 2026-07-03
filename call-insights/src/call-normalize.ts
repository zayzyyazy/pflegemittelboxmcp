import type { LeapingCallRecord } from './types.js';
import {
  classifyMarieTool,
  inferVerificationPath,
  type LeapingCallContext,
} from './leaping-context.js';

type JsonRecord = Record<string, unknown>;

const STRUCTURAL_EVENT_TYPES = new Set([
  'start',
  'end',
  'transition',
  'field_update',
  'function_call_request',
]);

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function readPath(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function readNested(record: JsonRecord, parentKeys: string[], keys: string[]): unknown {
  for (const parentKey of parentKeys) {
    const nested = asRecord(record[parentKey]);
    if (!nested) continue;
    const value = readPath(nested, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function mergeFields(target: JsonRecord, source: JsonRecord | null | undefined): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) {
      target[key] = value;
    }
  }
}

export interface ParsedLeapingTranscript {
  transcript_text?: string;
  utterances: string[];
  summary_text?: string;
  function_calls: Array<{ name: string; error?: string }>;
  field_values: JsonRecord;
  verification_tools: string[];
  utility_tools: string[];
  mcp_tools: string[];
  stages: string[];
  compact_timeline: string;
}

/** Leaping Calls API returns `transcript` as an event array (v2), not a plain string. */
export function parseLeapingTranscriptEvents(transcript: unknown): ParsedLeapingTranscript {
  const result: ParsedLeapingTranscript = {
    utterances: [],
    function_calls: [],
    field_values: {},
    verification_tools: [],
    utility_tools: [],
    mcp_tools: [],
    stages: [],
    compact_timeline: '',
  };

  if (!Array.isArray(transcript)) {
    return result;
  }

  const timeline: string[] = [];
  const seenFunctions = new Set<string>();
  const seenVerification = new Set<string>();
  const seenUtility = new Set<string>();
  const seenMcp = new Set<string>();
  const seenStages = new Set<string>();

  for (const entry of transcript) {
    const event = asRecord(entry);
    if (!event) continue;

    const type = asString(event.type) ?? 'event';
    const fields = asRecord(event.fields);
    mergeFields(result.field_values, fields);

    const eventSummary = asString(event.summary);
    if (eventSummary) result.summary_text = eventSummary;

    if (type === 'field_update') {
      const field = asString(event.field);
      const value = event.value ?? event.new_value;
      if (field && value !== undefined && value !== null) {
        result.field_values[field] = value;
      }
      continue;
    }

    if (type === 'function' || type === 'function_call') {
      const name = asString(event.name);
      if (name) {
        const error = asString(event.error);
        const key = `${name}:${error ?? ''}`;
        if (!seenFunctions.has(key)) {
          seenFunctions.add(key);
          result.function_calls.push({ name, error });
        }
        const kind = classifyMarieTool(name);
        if (kind === "verification" && !seenVerification.has(name)) {
          seenVerification.add(name);
          result.verification_tools.push(name);
        } else if (kind === "utility" && !seenUtility.has(name)) {
          seenUtility.add(name);
          result.utility_tools.push(name);
        } else if (kind === "mcp" && !seenMcp.has(name)) {
          seenMcp.add(name);
          result.mcp_tools.push(name);
        }
        const returned = asString(event.returned);
        timeline.push(
          error ? `${name} ERR` : `${name}${returned ? ' OK' : ''}`
        );
      }
      continue;
    }

    if (type === 'function_call_request') {
      const name = asString(event.name);
      if (name) timeline.push(`→${name}?`);
      continue;
    }

    if (type === 'transition') {
      const to = asString(event.to_name) ?? asString(event.to);
      if (to && !seenStages.has(to)) {
        seenStages.add(to);
        result.stages.push(to);
        timeline.push(`stage:${to}`);
      }
      continue;
    }

    if (STRUCTURAL_EVENT_TYPES.has(type) && type !== 'end') {
      continue;
    }

    const utterance = asString(
      readPath(event, [
        'content',
        'text',
        'message',
        'utterance',
        'speech',
        'said',
        'transcript',
        'user_message',
        'agent_message',
      ])
    );

    if (utterance) {
      const role =
        asString(readPath(event, ['role', 'speaker', 'from', 'source'])) ??
        (type.includes('user')
          ? 'user'
          : type.includes('agent') || type.includes('assistant')
            ? 'agent'
            : type);
      const line = `${role}: ${utterance}`;
      result.utterances.push(line);
      if (role === 'user' || role === 'agent' || role === 'assistant') {
        timeline.push(line.slice(0, 80));
      }
    }
  }

  result.compact_timeline = timeline.slice(0, 40).join(' | ');
  if (result.utterances.length) {
    result.transcript_text = result.utterances.join('\n');
  }

  return result;
}

function extractFieldValues(record: JsonRecord): JsonRecord {
  const merged: JsonRecord = {};
  const direct = asRecord(record.field_values) ?? asRecord(record.fields);
  mergeFields(merged, direct);
  const fromResults = asRecord(record.results);
  if (fromResults) {
    mergeFields(merged, asRecord(fromResults.field_values));
    mergeFields(merged, asRecord(fromResults.fields));
    mergeFields(merged, fromResults);
  }
  return merged;
}

function buildTranscriptFromMessages(record: JsonRecord): string | undefined {
  const messages = record.messages ?? record.transcript_messages ?? record.conversation;
  if (!Array.isArray(messages)) return undefined;

  const lines: string[] = [];
  for (const entry of messages) {
    const msg = asRecord(entry);
    if (!msg) continue;
    const role = asString(readPath(msg, ['role', 'speaker', 'type'])) ?? 'unknown';
    const content = asString(
      readPath(msg, ['content', 'text', 'message', 'transcript', 'utterance'])
    );
    if (content) lines.push(`${role}: ${content}`);
  }
  return lines.length ? lines.join('\n') : undefined;
}

function normalizeFunctionCallsFromList(
  raw: unknown,
  into: Array<{ name: string; error?: string }>,
  seen: Set<string>
): void {
  if (!Array.isArray(raw)) return;
  for (const item of raw) {
    const fc = asRecord(item);
    if (!fc) continue;
    const name = asString(readPath(fc, ['name', 'function_name', 'tool_name']));
    if (!name) continue;
    const error = asString(readPath(fc, ['error', 'error_message']));
    const key = `${name}:${error ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    into.push({ name, error });
  }
}

function normalizeDetectedEvents(record: JsonRecord): LeapingCallRecord['detected_events'] {
  const raw =
    record.detected_events ??
    readNested(record, ['results', 'result_values'], ['detected_events']);
  const events = asRecord(raw);
  if (!events) return undefined;

  return {
    customer_frustrated: asBoolean(events.customer_frustrated),
    customer_requested_human: asBoolean(events.customer_requested_human),
    technical_issue_mentioned: asBoolean(events.technical_issue_mentioned),
    repeated_birthday_requests: asNumber(events.repeated_birthday_requests),
    repeated_vnr_requests: asNumber(events.repeated_vnr_requests),
    repeated_address_requests: asNumber(events.repeated_address_requests),
    silence_or_dead_air: asBoolean(events.silence_or_dead_air),
  };
}

function deriveDuration(record: JsonRecord): number | undefined {
  const direct = readPath(record, ['duration_seconds', 'duration', 'leaping_duration_seconds']);
  const n = asNumber(direct);
  if (n !== undefined) return Math.round(n);
  const started = asString(readPath(record, ['started_at', 'created_at']));
  const ended = asString(readPath(record, ['ended_at', 'completed_at', 'updated_at']));
  if (!started || !ended) return undefined;
  const ms = Date.parse(ended) - Date.parse(started);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.round(ms / 1000);
}

function deriveVerificationSuccessful(
  record: JsonRecord,
  fieldValues: JsonRecord
): boolean | undefined {
  const keys = [
    'verification_successful',
    'verified',
    'authenticated',
    'authentication_successful',
    'leaping_conversation_usecase_successful',
    'leaping_conversation_completed',
  ];

  for (const source of [record, fieldValues]) {
    const value = asBoolean(readPath(source, keys));
    if (value !== undefined) return value;
  }

  const success = asBoolean(record.success);
  if (success !== undefined) return success;

  return undefined;
}

function deriveCallStatus(record: JsonRecord): LeapingCallRecord['call_status'] {
  const raw = asString(readPath(record, ['status', 'call_status']))?.toLowerCase();
  if (
    raw === 'completed' ||
    raw === 'failed' ||
    raw === 'transferred' ||
    raw === 'dropped' ||
    raw === 'in_progress'
  ) {
    return raw;
  }
  return 'unknown';
}

export function normalizeLeapingCall(call: unknown): LeapingCallRecord | null {
  const record = asRecord(call);
  if (!record) return null;

  const id = asString(readPath(record, ['id', 'call_id']));
  if (!id) return null;

  const fieldValues = extractFieldValues(record);

  const transcriptRaw = record.transcript;
  const parsedEvents =
    typeof transcriptRaw === 'string'
      ? {
          transcript_text: transcriptRaw,
          utterances: [],
          function_calls: [],
          field_values: {},
          verification_tools: [],
          utility_tools: [],
          mcp_tools: [],
          stages: [],
          compact_timeline: '',
        }
      : parseLeapingTranscriptEvents(transcriptRaw);

  mergeFields(fieldValues, parsedEvents.field_values);

  const summary_text =
    asString(record.summary) ??
    parsedEvents.summary_text ??
    asString(readPath(fieldValues, ['leaping_conversation_summary']));

  const fromMessages = buildTranscriptFromMessages(record);
  const utteranceText =
    parsedEvents.utterances.length > 0
      ? parsedEvents.utterances.join('\n')
      : fromMessages;

  const transcript_text =
    asString(readPath(record, ['transcript_text', 'transcript_content'])) ??
    utteranceText ??
    summary_text;

  const functionCalls: Array<{ name: string; error?: string }> = [];
  const seenFn = new Set<string>();
  const verificationTools = [...parsedEvents.verification_tools];
  const utilityTools = [...parsedEvents.utility_tools];
  const mcpTools = [...parsedEvents.mcp_tools];
  const stages = [...parsedEvents.stages];
  const seenVerification = new Set(verificationTools);
  const seenUtility = new Set(utilityTools);
  const seenMcp = new Set(mcpTools);

  function absorbTool(name: string): void {
    const kind = classifyMarieTool(name);
    if (kind === "verification" && !seenVerification.has(name)) {
      seenVerification.add(name);
      verificationTools.push(name);
    } else if (kind === "utility" && !seenUtility.has(name)) {
      seenUtility.add(name);
      utilityTools.push(name);
    } else if (kind === "mcp" && !seenMcp.has(name)) {
      seenMcp.add(name);
      mcpTools.push(name);
    }
  }

  normalizeFunctionCallsFromList(record.function_calls ?? record.tool_calls, functionCalls, seenFn);
  normalizeFunctionCallsFromList(
    readNested(record, ['results'], ['function_calls']),
    functionCalls,
    seenFn
  );
  for (const fc of parsedEvents.function_calls) {
    const key = `${fc.name}:${fc.error ?? ''}`;
    if (!seenFn.has(key)) {
      seenFn.add(key);
      functionCalls.push(fc);
    }
    absorbTool(fc.name);
  }
  for (const fc of functionCalls) {
    absorbTool(fc.name);
  }

  const intent = asString(readPath(fieldValues, ['intent']));
  const verification_path = inferVerificationPath(verificationTools);

  return {
    id,
    status: asString(readPath(record, ['status', 'call_status'])) ?? 'unknown',
    call_status: deriveCallStatus(record),
    created_at: asString(readPath(record, ['created_at', 'started_at', 'call_date'])),
    ended_at: asString(readPath(record, ['ended_at', 'completed_at'])),
    duration_seconds: deriveDuration(record),
    transcript_text,
    summary_text,
    verification_successful: deriveVerificationSuccessful(record, fieldValues),
    function_calls: functionCalls.length ? functionCalls : undefined,
    detected_events: normalizeDetectedEvents(record),
    leaping_context: {
      intent,
      verification_tools: verificationTools,
      utility_tools: utilityTools,
      mcp_tools: mcpTools,
      stages,
      utterances: parsedEvents.utterances,
      compact_timeline: parsedEvents.compact_timeline,
      verification_path,
      is_clone_mcp: mcpTools.length > 0,
    },
    raw: record,
  };
}
