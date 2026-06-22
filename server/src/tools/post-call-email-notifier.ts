import {
  type PostCallAlertDetectorInput,
  runPostCallAlertDetector,
  coercePostCallAlertDetectorInput,
} from './post-call-alert-detector.js';
import nodemailer from 'nodemailer';

export interface PostCallEmailNotifierInput extends PostCallAlertDetectorInput {
  call_date?: string;
  to_email?: string;
  dry_run?: boolean;
}

export interface PostCallEmailNotifierResult {
  ok: boolean;
  alert_required: boolean;
  email_attempted: boolean;
  email_sent: boolean;
  provider: 'resend' | 'gmail' | 'none';
  call_id: string | null;
  call_date: string | null;
  duration_label: string | null;
  biggest_problem: string;
  subject: string;
  email_text: string;
  message_id: string | null;
  reason: string;
  safety_flags: string[];
}

export interface EmailSendConfig {
  provider?: 'resend' | 'gmail';
  apiKey?: string;
  from?: string;
  defaultTo?: string;
  subjectPrefix?: string;
  gmailUser?: string;
  gmailAppPassword?: string;
}

export interface SendEmailPayload {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export type SendEmailFn = (
  payload: SendEmailPayload,
  config: EmailSendConfig
) => Promise<{ id: string | null; provider: 'resend' | 'gmail' }>;

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export function coercePostCallEmailNotifierInput(
  input: Record<string, unknown>
): PostCallEmailNotifierInput {
  const alertInput = coercePostCallAlertDetectorInput(input);
  return {
    ...alertInput,
    call_date: asString(input.call_date),
    to_email: asString(input.to_email),
    dry_run: asBoolean(input.dry_run),
  };
}

function formatDuration(durationSeconds: number | undefined): string | null {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return null;
  }
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function deriveCallDate(input: PostCallEmailNotifierInput): string | null {
  if (input.call_date) return input.call_date;
  const candidateTimestamps = [
    ...(input.function_calls?.map((call) => call.timestamp).filter(Boolean) ?? []),
    ...(input.transitions?.map((transition) => transition.timestamp).filter(Boolean) ?? []),
  ] as string[];
  if (candidateTimestamps.length === 0) return null;
  return candidateTimestamps.sort()[0] ?? null;
}

function biggestProblemLabel(alertType: PostCallEmailNotifierResult['biggest_problem'] | string): string {
  switch (alertType) {
    case 'MISSING_BIRTHDAY_SYSTEM':
      return 'Birthday verification was blocked because birthday_system was missing.';
    case 'LONG_FAILED_VERIFICATION':
      return 'The call ran for a long time without successful verification.';
    case 'CUSTOMER_FRUSTRATED':
      return 'The caller showed clear frustration during the call.';
    case 'TECHNICAL_ERROR':
      return 'A technical error needs review.';
    case 'REPEATED_AUTHENTICATION':
      return 'The caller got stuck in repeated birthday, address, or VNR prompts.';
    case 'DROPPED_OR_FAILED_CALL':
      return 'The call ended as failed or dropped.';
    case 'TRANSFER_REQUEST_NOT_HANDLED':
      return 'The caller requested a human, but no transfer was detected.';
    case 'UNKNOWN_FAILURE':
      return 'The call ended with an unclear failure state.';
    default:
      return 'No major post-call issue was detected.';
  }
}

export function buildPostCallAlertEmail(
  input: PostCallEmailNotifierInput
): {
  alert_required: boolean;
  biggest_problem: string;
  subject: string;
  email_text: string;
  safety_flags: string[];
} {
  const alert = runPostCallAlertDetector(input);
  const callDate = deriveCallDate(input);
  const durationLabel = formatDuration(input.duration_seconds);
  const biggest_problem = biggestProblemLabel(alert.alert_type);
  const subjectPrefix = '[Pflegemittelbox Alert]';
  const subject = alert.alert_required
    ? `${subjectPrefix} ${alert.title}`
    : `${subjectPrefix} No alert required`;

  const lines = [
    `Call ID: ${input.call_id ?? 'unknown'}`,
    `Call date: ${callDate ?? 'unknown'}`,
    `Duration: ${durationLabel ?? 'unknown'}`,
    `Severity: ${alert.severity}`,
    `Biggest problem: ${biggest_problem}`,
    '',
    `Summary: ${alert.summary}`,
    alert.evidence.length > 0 ? `Evidence: ${alert.evidence.join(' | ')}` : 'Evidence: none',
    `Recommended next step: ${alert.recommended_next_step}`,
  ];

  return {
    alert_required: alert.alert_required,
    biggest_problem,
    subject,
    email_text: lines.join('\n'),
    safety_flags: alert.safety_flags,
  };
}

export async function sendViaResend(
  payload: SendEmailPayload,
  config: EmailSendConfig
): Promise<{ id: string | null; provider: 'resend' | 'gmail' }> {
  if (!config.apiKey) {
    throw new Error('Missing Resend API key.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Resend request failed with HTTP ${response.status}`);
  }
  return { id: body.id ?? null, provider: 'resend' };
}

export async function sendViaGmail(
  payload: SendEmailPayload,
  config: EmailSendConfig
): Promise<{ id: string | null; provider: 'resend' | 'gmail' }> {
  if (!config.gmailUser || !config.gmailAppPassword) {
    throw new Error('Missing Gmail SMTP credentials.');
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: config.gmailUser,
      pass: config.gmailAppPassword,
    },
  });

  const info = await transporter.sendMail({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
  });

  return { id: info.messageId ?? null, provider: 'gmail' };
}

export async function runPostCallEmailNotifier(
  input: PostCallEmailNotifierInput,
  config: EmailSendConfig,
  sendEmail?: SendEmailFn
): Promise<PostCallEmailNotifierResult> {
  const alert = runPostCallAlertDetector(input);
  const call_date = deriveCallDate(input);
  const duration_label = formatDuration(input.duration_seconds);
  const built = buildPostCallAlertEmail(input);

  if (!alert.alert_required) {
    return {
      ok: true,
      alert_required: false,
      email_attempted: false,
      email_sent: false,
      provider: 'none',
      call_id: input.call_id ?? null,
      call_date,
      duration_label,
      biggest_problem: built.biggest_problem,
      subject: built.subject,
      email_text: built.email_text,
      message_id: null,
      reason: 'No email was sent because the detector did not require an alert.',
      safety_flags: built.safety_flags,
    };
  }

  if (input.dry_run) {
    return {
      ok: true,
      alert_required: true,
      email_attempted: false,
      email_sent: false,
      provider: 'none',
      call_id: input.call_id ?? null,
      call_date,
      duration_label,
      biggest_problem: built.biggest_problem,
      subject: built.subject,
      email_text: built.email_text,
      message_id: null,
      reason: 'Dry run mode is enabled, so the email preview was generated but not sent.',
      safety_flags: built.safety_flags,
    };
  }

  const to = input.to_email ?? config.defaultTo;
  if (!config.from || !to) {
    return {
      ok: false,
      alert_required: true,
      email_attempted: false,
      email_sent: false,
      provider: 'none',
      call_id: input.call_id ?? null,
      call_date,
      duration_label,
      biggest_problem: built.biggest_problem,
      subject: built.subject,
      email_text: built.email_text,
      message_id: null,
      reason: 'Email alert configuration is incomplete. Set ALERT_EMAIL_FROM and ALERT_EMAIL_TO plus the selected provider credentials.',
      safety_flags: [...built.safety_flags, 'missing_email_config'],
    };
  }

  const provider = config.provider ?? 'resend';
  const providerReady =
    provider === 'gmail'
      ? Boolean(config.gmailUser && config.gmailAppPassword)
      : Boolean(config.apiKey);
  if (!providerReady) {
    return {
      ok: false,
      alert_required: true,
      email_attempted: false,
      email_sent: false,
      provider: 'none',
      call_id: input.call_id ?? null,
      call_date,
      duration_label,
      biggest_problem: built.biggest_problem,
      subject: built.subject,
      email_text: built.email_text,
      message_id: null,
      reason:
        provider === 'gmail'
          ? 'Gmail SMTP configuration is incomplete. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.'
          : 'Resend configuration is incomplete. Set RESEND_API_KEY.',
      safety_flags: [...built.safety_flags, 'missing_email_config'],
    };
  }

  const subject = config.subjectPrefix ? `${config.subjectPrefix} ${built.subject}` : built.subject;
  const sender =
    sendEmail ?? (provider === 'gmail' ? sendViaGmail : sendViaResend);
  const sent = await sender(
    {
      to,
      from: config.from,
      subject,
      text: built.email_text,
    },
    config
  );

  return {
    ok: true,
    alert_required: true,
    email_attempted: true,
    email_sent: true,
    provider: sent.provider,
    call_id: input.call_id ?? null,
    call_date,
    duration_label,
    biggest_problem: built.biggest_problem,
    subject,
    email_text: built.email_text,
    message_id: sent.id,
    reason: 'Alert email was sent successfully.',
    safety_flags: built.safety_flags,
  };
}
