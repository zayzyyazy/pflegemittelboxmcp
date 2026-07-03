import type { LeapingCallRecord } from './types.js';

type JsonRecord = Record<string, unknown>;

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

function extractFieldValues(record: JsonRecord): JsonRecord {
  const direct = asRecord(record.field_values) ?? asRecord(record.fields);
  if (direct) return direct;
  const fromResults = asRecord(record.results);
  if (fromResults) {
    return asRecord(fromResults.field_values) ?? asRecord(fromResults.fields) ?? fromResults;
  }
  return {};
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

function normalizeFunctionCalls(record: JsonRecord): LeapingCallRecord['function_calls'] {
  const raw =
    record.function_calls ??
    record.tool_calls ??
    readNested(record, ['results'], ['function_calls']);

  if (!Array.isArray(raw)) return undefined;

  return raw
    .map((item) => {
      const fc = asRecord(item);
      if (!fc) return null;
      const name = asString(readPath(fc, ['name', 'function_name', 'tool_name']));
      if (!name) return null;
      return {
        name,
        error: asString(readPath(fc, ['error', 'error_message'])),
      };
    })
    .filter((x): x is { name: string; error?: string } => x !== null);
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
  const direct = readPath(record, ['duration_seconds', 'duration']);
  if (typeof direct === 'number' && Number.isFinite(direct)) return Math.round(direct);
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
  const direct = asBoolean(
    readPath(record, [
      'verification_successful',
      'verified',
      'authenticated',
      'authentication_successful',
    ])
  );
  if (direct !== undefined) return direct;

  return asBoolean(
    readPath(fieldValues, [
      'verification_successful',
      'verified',
      'authenticated',
      'authentication_successful',
    ])
  );
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
  const fromMessages = buildTranscriptFromMessages(record);
  const transcript =
    asString(readPath(record, ['transcript_text', 'transcript', 'transcript_content'])) ??
    fromMessages;

  return {
    id,
    status: asString(readPath(record, ['status', 'call_status'])) ?? 'unknown',
    call_status: deriveCallStatus(record),
    created_at: asString(readPath(record, ['created_at', 'started_at', 'call_date'])),
    ended_at: asString(readPath(record, ['ended_at', 'completed_at'])),
    duration_seconds: deriveDuration(record),
    transcript_text: transcript,
    verification_successful: deriveVerificationSuccessful(record, fieldValues),
    phone_lookup_found: asBoolean(readPath(fieldValues, ['phone_lookup_found'])),
    function_calls: normalizeFunctionCalls(record),
    detected_events: normalizeDetectedEvents(record),
    raw: record,
  };
}
