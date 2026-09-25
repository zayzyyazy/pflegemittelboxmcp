import { Router, json, type ErrorRequestHandler } from 'express';
import { createAppointmentService, type AppointmentConfig } from '../services/appointments.js';

export function createAppointmentsRouter(
  config: AppointmentConfig,
  options: Parameters<typeof createAppointmentService>[1] = {},
) {
  const router = Router();
  const service = createAppointmentService(config, options);

  for (const [path, run] of [
    ['/check', service.check],
    ['/create', service.create],
  ] as const) {
    router.post(path, json(), async (req, res) => {
      const result = await run(req.body);
      res.status(result.status).json(result.body);
    });
  }

  const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : 400;
    res.status(status).json({ ok: false, error: status === 413 ? 'Request body too large.' : 'Invalid JSON request body.' });
  };
  router.use(jsonErrorHandler);
  return router;
}
