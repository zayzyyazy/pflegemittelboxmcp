import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    ENV_LABEL: z.string().trim().min(1).default('local'),
    PUBLIC_BASE_URL: z.string().trim().url().optional(),
    MCP_AUTH_ENABLED: z.coerce.boolean().default(false),
    MCP_AUTH_TYPE: z.enum(['bearer', 'header']).optional(),
    MCP_AUTH_TOKEN: z.string().trim().min(1).optional(),
    MCP_AUTH_HEADER_NAME: z.string().trim().min(1).optional(),
    MCP_AUTH_HEADER_VALUE: z.string().trim().min(1).optional(),
    DASHBOARD_AUTH_ENABLED: z.coerce.boolean().default(false),
    DASHBOARD_AUTH_USERNAME: z.string().trim().min(1).optional(),
    DASHBOARD_AUTH_PASSWORD: z.string().trim().min(1).optional(),
    POST_CALL_MONITOR_ENABLED: z.coerce.boolean().default(false),
    POST_CALL_MONITOR_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(60),
    POST_CALL_MONITOR_LOOKBACK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    POST_CALL_MONITOR_FETCH_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
    LEAPING_API_BASE_URL: z.string().trim().url().default('https://api.leaping.ai/v1'),
    LEAPING_API_USERNAME: z.string().trim().min(1).optional(),
    LEAPING_API_PASSWORD: z.string().trim().min(1).optional(),
    LEAPING_API_CLIENT_ID: z.string().trim().min(1).optional(),
    LEAPING_API_CLIENT_SECRET: z.string().trim().min(1).optional(),
    LEAPING_AGENT_ID: z.string().trim().min(1).optional(),
    LEAPING_FUNC_BASE: z.string().trim().url().optional(),
    LEAPING_FUNC_API_KEY: z.string().trim().min(1).optional(),
    PFLEGEMITTELBOX_API_BASE: z.string().trim().url().optional(),
    PFLEGEMITTELBOX_API_KEY: z.string().trim().min(1).optional(),
    ALERT_EMAIL_PROVIDER: z.enum(['gmail', 'resend']).optional(),
    ALERT_EMAIL_FROM: z.string().trim().min(1).optional(),
    ALERT_EMAIL_TO: z.string().trim().email().optional(),
    ALERT_EMAIL_SUBJECT_PREFIX: z.string().trim().optional(),
    ALERT_EMAIL_LLM_ENABLED: z.coerce.boolean().default(false),
    RESEND_API_KEY: z.string().trim().min(1).optional(),
    GMAIL_SMTP_USER: z.string().trim().email().optional(),
    GMAIL_SMTP_APP_PASSWORD: z.string().trim().min(1).optional(),
    OPENAI_API_KEY: z.string().trim().min(1).optional(),
    OPENAI_MODEL: z.string().trim().min(1).default('gpt-4.1-mini'),
    OPENAI_BASE_URL: z.string().trim().url().default('https://api.openai.com/v1'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.MCP_AUTH_ENABLED !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MCP_AUTH_ENABLED'],
        message: 'MCP_AUTH_ENABLED must be true in production.',
      });
    }

    if (env.NODE_ENV === 'production' && env.DASHBOARD_AUTH_ENABLED !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DASHBOARD_AUTH_ENABLED'],
        message: 'DASHBOARD_AUTH_ENABLED must be true in production.',
      });
    }

    if (env.MCP_AUTH_ENABLED) {
      if (!env.MCP_AUTH_TYPE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MCP_AUTH_TYPE'],
          message: 'MCP_AUTH_TYPE is required when MCP_AUTH_ENABLED=true.',
        });
      }

      if (env.MCP_AUTH_TYPE === 'bearer' && !env.MCP_AUTH_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MCP_AUTH_TOKEN'],
          message: 'MCP_AUTH_TOKEN is required when MCP_AUTH_TYPE=bearer.',
        });
      }

      if (env.MCP_AUTH_TYPE === 'header') {
        if (!env.MCP_AUTH_HEADER_NAME) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MCP_AUTH_HEADER_NAME'],
            message: 'MCP_AUTH_HEADER_NAME is required when MCP_AUTH_TYPE=header.',
          });
        }
        if (!env.MCP_AUTH_HEADER_VALUE) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MCP_AUTH_HEADER_VALUE'],
            message: 'MCP_AUTH_HEADER_VALUE is required when MCP_AUTH_TYPE=header.',
          });
        }
      }
    }

    if (env.DASHBOARD_AUTH_ENABLED) {
      if (!env.DASHBOARD_AUTH_USERNAME) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DASHBOARD_AUTH_USERNAME'],
          message: 'DASHBOARD_AUTH_USERNAME is required when DASHBOARD_AUTH_ENABLED=true.',
        });
      }
      if (!env.DASHBOARD_AUTH_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DASHBOARD_AUTH_PASSWORD'],
          message: 'DASHBOARD_AUTH_PASSWORD is required when DASHBOARD_AUTH_ENABLED=true.',
        });
      }
    }

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

    if (env.POST_CALL_MONITOR_ENABLED) {
      if (!env.LEAPING_API_USERNAME) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LEAPING_API_USERNAME'],
          message: 'LEAPING_API_USERNAME is required when POST_CALL_MONITOR_ENABLED=true.',
        });
      }
      if (!env.LEAPING_API_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LEAPING_API_PASSWORD'],
          message: 'LEAPING_API_PASSWORD is required when POST_CALL_MONITOR_ENABLED=true.',
        });
      }
      if (!env.ALERT_EMAIL_PROVIDER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALERT_EMAIL_PROVIDER'],
          message: 'ALERT_EMAIL_PROVIDER is required when POST_CALL_MONITOR_ENABLED=true.',
        });
      }
      if (!env.ALERT_EMAIL_TO) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALERT_EMAIL_TO'],
          message: 'ALERT_EMAIL_TO is required when POST_CALL_MONITOR_ENABLED=true.',
        });
      }
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
