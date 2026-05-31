import { z } from 'zod';
import { fetchJson } from '@/lib/http';

// Thin Resend wrapper — single POST to /emails. Resend's official SDK pulls
// in node-only deps and we only need one endpoint; raw fetch (with the
// shared retry/timeout/logging from lib/http) keeps the surface small.
//
// Sender: must be a verified domain on the account, or Resend's sandbox
// sender for the founder's first proof. Configured via env so the same
// code handles both modes.

const RESEND_BASE = 'https://api.resend.com';

const ResendSuccessSchema = z.object({ id: z.string() });
export type ResendSendResult = z.infer<typeof ResendSuccessSchema>;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Optional override of the default From; useful for testing with the
  // sandbox sender without touching env vars.
  from?: string;
}

function requireFrom(): string {
  const v = process.env.RESEND_FROM_EMAIL;
  if (!v) {
    throw new Error(
      'RESEND_FROM_EMAIL is not set; configure a verified sender (or Resend onboarding sandbox) before sending.',
    );
  }
  return v;
}

function requireKey(): string {
  const v = process.env.RESEND_API_KEY;
  if (!v) throw new Error('RESEND_API_KEY is not set; cannot send email.');
  return v;
}

export async function sendEmail(input: SendEmailInput): Promise<ResendSendResult> {
  const raw = await fetchJson(
    `${RESEND_BASE}/emails`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from ?? requireFrom(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    },
    {
      timeoutMs: 20_000,
      retries: 3,
      context: { source: 'resend', endpoint: 'emails' },
    },
  );
  return ResendSuccessSchema.parse(raw);
}
