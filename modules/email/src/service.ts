export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  ok: boolean;
  provider: 'resend' | 'disabled';
  id?: string;
  reason?: string;
}

export function emailReadiness(env: NodeJS.ProcessEnv = process.env): { ok: boolean; missing: string[]; provider: 'resend' | 'disabled' } {
  const provider = env.RESEND_API_KEY ? 'resend' : 'disabled';
  const missing: string[] = [];
  if (!env.EMAIL_FROM) missing.push('EMAIL_FROM');
  if (provider === 'disabled') missing.push('RESEND_API_KEY');
  return { ok: missing.length === 0, missing, provider };
}

export async function sendTransactionalEmail(message: EmailMessage, env: NodeJS.ProcessEnv = process.env): Promise<EmailSendResult> {
  const ready = emailReadiness(env);
  if (!ready.ok) return { ok: false, provider: ready.provider, reason: `email not configured: ${ready.missing.join(', ')}` };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      reply_to: message.replyTo || env.EMAIL_REPLY_TO,
    }),
  });
  if (!res.ok) return { ok: false, provider: 'resend', reason: `resend rejected request: ${res.status}` };
  const data = await res.json().catch(() => ({})) as { id?: string };
  return { ok: true, provider: 'resend', id: data.id };
}
