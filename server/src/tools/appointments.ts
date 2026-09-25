import { appConfig } from '../config.js';
import { createAppointmentService, type AppointmentConfig } from '../services/appointments.js';

export const appointmentTools = [
  {
    name: 'pmb_check_available_slots',
    description: 'Check available appointment slots for a date (YYYY-MM-DD). Availability is determined by the appointment service.',
    inputSchema: {
      type: 'object' as const,
      properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
      required: ['date'],
    },
  },
  {
    name: 'pmb_create_appointment',
    description: 'Book an appointment for a customer. The appointment service rechecks availability, creates the calendar event, and sends the service email.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        phone: { type: 'string', minLength: 1 },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
        call_id: { type: 'string', minLength: 1 },
        reason: { type: 'string', minLength: 1 },
      },
      required: ['customer_id', 'name', 'phone', 'date', 'time'],
    },
  },
];

export async function runAppointmentTool(
  name: 'pmb_check_available_slots' | 'pmb_create_appointment',
  args: unknown,
  config: AppointmentConfig = appConfig,
) {
  const service = createAppointmentService(config);
  const { body } = await (name === 'pmb_check_available_slots' ? service.check(args) : service.create(args));
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
    structuredContent: body,
    isError: body.ok !== true,
  };
}
