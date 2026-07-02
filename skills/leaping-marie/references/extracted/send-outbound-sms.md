# Send outbound sms

<!-- source: Send outbound sms - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Export calls Create phone deployment
Powered by
SMS
Send outbound sms
Send Outbound SMS
Send one or more outbound SMS messages from an agent. Each recipient is validated, screened against your
Do Not Call list and per-recipient daily limits, and queued for delivery. Messages are sent asynchronously —
this endpoint accepts and schedules them, it does not block until delivery.
The response is 1:1 with the input: results has exactly one entry per recipient, in the same order, so you
can map each outcome (pending, conflict, dnc_filtered, daily_limit_filtered, failed) back to
the number you submitted.
This API is the only way to send outbound SMS today — there is no dashboard UI for it yet.
How Message Bodies Are Built
For each recipient, the effective template is the recipient’s message_template if set, otherwise the top-level
message_template. Template variables are resolved from the union of the agent snapshot’s fields and the
merged field_overrides (top-level values overridden by per-recipient values). If a template references a
variable that can’t be resolved, that recipient fails with unresolvable_template_vars and the offending
names are listed in error_metadata.unresolvable_vars.
If no template is provided and the agent is configured to speak first (its first conversation stage begins on a
user turn), the agent itself generates the opening message.
Do Not Call & Daily Limits
Before queuing, every recipient is screened individually — the rest of the batch still proceeds:
Validation Rules
Idempotency
To make retries safe, pass an optional Idempotency-Key header (Stripe-equivalent semantics). The value is
an opaque string up to 255 characters. Use one key per logical operation and reuse it across retries —
generating a fresh key per attempt defeats the purpose.
Common Errors
Example
Do Not Call: recipients on your group’s Do Not Call list are not messaged and are returned with status
dnc_filtered.
Per-recipient daily limit: recipients who have reached the configured per-day SMS cap are not
messaged and are returned with status daily_limit_filtered.
Either agent_id or agent_snapshot_id must be provided. If both are given, agent_snapshot_id
takes precedence.
from_phone_id and from_phone_number are mutually exclusive. If both are omitted, an SMS-deployed
phone for the agent is selected automatically.
recipient_phone_numbers must contain between 1 and 1000 entries, each a valid E.164 number.
scheduled_for (top-level or per-recipient) must be timezone-aware — a naive datetime is rejected —
and must be in the future.
Replay-safe. Within the TTL (default 24 hours, configurable via IDEMPOTENCY_TTL_SECONDS), an identical
retry from the same authenticated user with the same body returns the cached response without re-
queuing.
Body fingerprint. A retry that reuses the key with a different body returns 422 Unprocessable Entity
instead of silently replaying.
In-flight conflict. A retry that arrives while a sibling request with the same key is still processing returns
409 Conflict.
Failures are not cached. If the original request fails, the response is not stored — retry with the same key
and it will execute.
Per-user scope. Keys are scoped to the authenticated user.
Optional. Omit the header (or send a whitespace-only value) to fall back to the non-idempotent
behaviour.
400 Bad Request: The agent snapshot was not found, the agent has no group, the sending phone is not
found or not SMS-deployed to this agent, the phone’s region is not configured for SMS, the phone uses
external (BYO) Twilio credentials, or scheduled_for is in the past.
409 Conflict: An Idempotency-Key was supplied while a sibling request with the same key is still
being processed.
422 Unprocessable Entity: The request body failed validation, or an Idempotency-Key was reused
with a different body.
curl -X POST "https://api.leaping.ai/v1/sms/outbound" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: 7f3c1b2e-9a4d-4b8e-bc51-1d2e3f4a5b6c" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "from_phone_number": "+15551234567",
    "message_template": "Hi {{ customer_name }}, your appointment is at {{ appointment_time }}.",
    "recipient_phone_numbers": [
      {
        "phone_number": "+15557654321",
        "field_overrides": { "customer_name": "John Doe", "appointment_time": "3:00 PM" }
      },
      {
        "phone_number": "+15559876543",
        "field_overrides": { "customer_name": "Jane Smith", "appointment_time": "4:30 PM" }
      }
    ],
    "scheduled_for": "2026-06-01T15:00:00+00:00"
  }'
{
  "scheduled_count": 1,
  "sent_count": 0,
  "failed_count": 0,
  "conflict_count": 1,
  "dnc_filtered_count": 0,
  "daily_limit_filtered_count": 0,
  "results": [
    {
      "status": "pending",
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "phone_number": "+15557654321",
      "scheduled_for": "2026-06-01T15:00:00+00:00"
    },
    {
      "status": "conflict",
      "phone_number": "+15559876543",
      "error": "duplicate_pending_row",
      "existing_id": "1f0c2a44-9d2a-4e6b-8b1a-2c3d4e5f6a7b"
    }
  ]
}
Ask a question...
⌘I

