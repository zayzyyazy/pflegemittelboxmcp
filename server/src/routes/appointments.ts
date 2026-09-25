import { Router, json, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config.js';

const checkInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const requiredText = z.string().trim().min(1);
const createInput = checkInput.extend({
  customer_id: requiredText,
  name: requiredText,
  phone: requiredText,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  call_id: requiredText.optional(),
  reason: requiredText.optional(),
});

type AppointmentConfig = Pick<AppConfig,
  'GOOGLE_APPOINTMENT_WEBAPP_URL' | 'GOOGLE_APPOINTMENT_API_SECRET'>;

export function createAppointmentsRouter(
  config: AppointmentConfig,
  { fetchImpl = fetch, timeoutMs = 15_000 } = {},
) {
  const router = Router();

  for (const [path, action, schema] of [
    ['/check', 'check_available_slots', checkInput],
    ['/create', 'create_appointment', createInput],
  ] as const) {
    router.post(path, json(), async (req, res) => {
      const input = schema.safeParse(req.body);
      if (!input.success) {
        res.status(400).json({ ok: false, error: 'Invalid appointment input.',
          fields: [...new Set(input.error.issues.map((issue) => issue.path.join('.')))] });
        return;
      }

      const url = config.GOOGLE_APPOINTMENT_WEBAPP_URL;
      const secret = config.GOOGLE_APPOINTMENT_API_SECRET;
      if (!url || !secret) {
        res.status(503).json({ ok: false, error: 'Appointment service is not configured.' });
        return;
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
          res.status(502).json({ ok: false, error: 'Appointment service request failed.' });
          return;
        }

        const result: unknown = await upstream.json();
        // Reject unexpected responses and any accidental secret echo, including in
        // nested values/keys. Never forward upstream headers or raw error bodies.
        if (!result || typeof result !== 'object' || Array.isArray(result)
          || !('ok' in result) || typeof result.ok !== 'boolean'
          || JSON.stringify(result).includes(JSON.stringify(secret).slice(1, -1))) {
          res.status(502).json({ ok: false, error: 'Invalid appointment service response.' });
          return;
        }
        res.json(result);
      } catch {
        res.status(signal.aborted ? 504 : 502).json({
          ok: false,
          error: signal.aborted ? 'Appointment service timed out.' : 'Appointment service unavailable or returned invalid JSON.',
        });
      }
    });
  }

  const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : 400;
    res.status(status).json({ ok: false, error: status === 413 ? 'Request body too large.' : 'Invalid JSON request body.' });
  };
  router.use(jsonErrorHandler);
  return router;
}
