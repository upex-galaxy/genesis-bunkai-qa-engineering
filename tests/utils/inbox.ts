import { expect } from '@playwright/test';
import { config } from '@variables';

const RESEND_API = 'https://api.resend.com';
const POLL_INTERVAL_MS = 3_000;
const OTP_PATTERN = /\b(\d{6,8})\b/;

interface ReceivedEmailSummary {
  id: string
  to: string[] | string
  created_at?: string
}

interface ReceivedEmail {
  text?: string | null
  html?: string | null
  subject?: string | null
}

async function resendGet<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const response = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  }
  catch {
    return null;
  }
}

export async function isInboxReadable(): Promise<boolean> {
  const apiKey = config.qaInbox.apiKey;
  if (apiKey === null) {
    return false;
  }
  return (await resendGet<{ data: ReceivedEmailSummary[] }>('/emails/receiving?limit=1', apiKey)) !== null;
}

function addressedTo(summary: ReceivedEmailSummary, email: string): boolean {
  const recipients = Array.isArray(summary.to) ? summary.to : [summary.to];
  return recipients.some(recipient => recipient.toLowerCase().includes(email.toLowerCase()));
}

function extractCode(message: ReceivedEmail): string | null {
  const text = message.text || message.html?.replace(/<[^>]+>/g, ' ') || '';
  return OTP_PATTERN.exec(text)?.[1] ?? null;
}

export async function waitForSignupOtp(email: string, options: { timeoutMs: number }): Promise<string | null> {
  const apiKey = config.qaInbox.apiKey;
  if (apiKey === null) {
    return null;
  }
  let code: string | null = null;
  try {
    await expect.poll(async () => {
      code = await readSignupOtp(email, apiKey);
      return code;
    }, { timeout: options.timeoutMs, intervals: [POLL_INTERVAL_MS] }).not.toBeNull();
  }
  catch {
    return null;
  }
  return code;
}

async function readSignupOtp(email: string, apiKey: string): Promise<string | null> {
  const list = await resendGet<{ data: ReceivedEmailSummary[] }>('/emails/receiving?limit=20', apiKey);
  const match = list?.data.find(summary => addressedTo(summary, email));
  if (!match) {
    return null;
  }
  const message = await resendGet<ReceivedEmail>(`/emails/receiving/${match.id}`, apiKey);
  return message ? extractCode(message) : null;
}
