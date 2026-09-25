import { z } from 'zod';
import type { AppConfig } from '../config.js';

export const checkInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const requiredText = z.string().trim().min(1);
export const createInput = checkInput.extend({
  customer_id: requiredText,
  name: requiredText,
  phone: requiredText,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  call_id: requiredText.optional(),
  reason: requiredText.optional(),
});

export type AppointmentConfig = Pick<AppConfig,
  'GOOGLE_APPOINTMENT_WEBAPP_URL' | 'GOOGLE_APPOINTMENT_API_SECRET'>;

export function createAppointmentService(
  config: AppointmentConfig,
  { fetchImpl = fetch, timeoutMs = 15_000 } = {},
) {
  async function run(action: string, schema: typeof checkInput | typeof createInput, args: unknown): Promise<{
    status: number;
    body: Record<string, unknown>;
  }> {
    const input = schema.safeParse(args);
    if (!input.success) {
      return { status: 400, body: { ok: false, error: 'Invalid appointment input.',
        fields: [...new Set(input.error.issues.map((issue) => issue.path.join('.')))] } };
    }

    const url = config.GOOGLE_APPOINTMENT_WEBAPP_URL;
    const secret = config.GOOGLE_APPOINTMENT_API_SECRET;
    if (!url || !secret) {
      return { status: 503, body: { ok: false, error: 'Appointment service is not configured.' } };
    }

    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const upstream = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        signal,
        body: JSON.stringify({ ...input.data, secret, action }),
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        return { status: 502, body: { ok: false, error: 'Appointment service request failed.' } };
      }

      const result: unknown = await upstream.json();
      // Reject unexpected responses and any accidental secret echo, including in
      // nested values/keys. Never forward upstream headers or raw error bodies.
      if (!result || typeof result !== 'object' || Array.isArray(result)
        || !('ok' in result) || typeof result.ok !== 'boolean'
        || JSON.stringify(result).includes(JSON.stringify(secret).slice(1, -1))) {
        return { status: 502, body: { ok: false, error: 'Invalid appointment service response.' } };
      }
      return { status: 200, body: result as Record<string, unknown> };
    } catch {
      return { status: signal.aborted ? 504 : 502, body: {
        ok: false,
        error: signal.aborted ? 'Appointment service timed out.' : 'Appointment service unavailable or returned invalid JSON.',
      } };
    }
  }
  return {
    check: (args: unknown) => run('check_available_slots', checkInput, args),
    create: (args: unknown) => run('create_appointment', createInput, args),
  };
}
