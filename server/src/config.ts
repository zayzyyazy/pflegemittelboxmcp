import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    ENV_LABEL: z.string().trim().min(1).default('local'),
    PUBLIC_BASE_URL: z.string().trim().url().optional(),
    ALERT_EMAIL_PROVIDER: z.enum(['gmail', 'resend']).optional(),
    ALERT_EMAIL_FROM: z.string().trim().min(1).optional(),
    ALERT_EMAIL_TO: z.string().trim().email().optional(),
    ALERT_EMAIL_SUBJECT_PREFIX: z.string().trim().optional(),
    RESEND_API_KEY: z.string().trim().min(1).optional(),
    GMAIL_SMTP_USER: z.string().trim().email().optional(),
    GMAIL_SMTP_APP_PASSWORD: z.string().trim().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.ALERT_EMAIL_PROVIDER === 'gmail') {
      if (!env.GMAIL_SMTP_USER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GMAIL_SMTP_USER'],
          message: 'GMAIL_SMTP_USER is required when ALERT_EMAIL_PROVIDER=gmail.',
        });
      }
      if (!env.GMAIL_SMTP_APP_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GMAIL_SMTP_APP_PASSWORD'],
          message: 'GMAIL_SMTP_APP_PASSWORD is required when ALERT_EMAIL_PROVIDER=gmail.',
        });
      }
    }

    if (env.ALERT_EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when ALERT_EMAIL_PROVIDER=resend.',
      });
    }

    if (env.ALERT_EMAIL_PROVIDER && !env.ALERT_EMAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALERT_EMAIL_FROM'],
        message: 'ALERT_EMAIL_FROM is required when ALERT_EMAIL_PROVIDER is set.',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export const appConfig = loadConfig();
