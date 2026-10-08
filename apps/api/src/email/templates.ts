import { z } from 'zod';
import { fontFamily, themes } from '@ongod/tokens';
import { mn } from '../i18n/mn';

const code = z.string().regex(/^\d{6}$/);
const name = z.string().min(1).max(100);

/** Params per template, validated when the email job is enqueued and again when it runs. */
export const emailTemplateSchemas = {
  verifyEmail: z.object({ firstName: name, code }),
  resetPassword: z.object({ firstName: name, code }),
  changeEmail: z.object({ firstName: name, code }),
  paymentApproved: z.object({ firstName: name, endsAt: z.string().min(1) }),
  paymentRejected: z.object({ firstName: name, reason: z.string().min(1).max(1000) }),
  accessEnding: z.object({ firstName: name, endsAt: z.string().min(1) }),
} as const;

export type EmailTemplate = keyof typeof emailTemplateSchemas;
export type EmailParams<T extends EmailTemplate> = z.infer<(typeof emailTemplateSchemas)[T]>;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

// Email clients render light backgrounds best, so emails use the light theme tokens.
const c = themes.light;

function layout(text: string): string {
  const paragraphs = text
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replaceAll('\n', '<br>')}</p>`)
    .join('');
  return `<!doctype html><html lang="mn"><body style="margin:0;padding:24px;background:${c.bg};color:${c.textPrimary};font-family:${fontFamily.ui},Arial,sans-serif;font-size:16px;line-height:24px"><div style="max-width:560px;margin:0 auto;padding:24px;background:${c.surface};border-radius:12px">${paragraphs}</div></body></html>`;
}

export function renderEmail<T extends EmailTemplate>(
  template: T,
  params: EmailParams<T>,
): RenderedEmail {
  const t = mn.email[template] as { subject: string; body: (p: EmailParams<T>) => string };
  const text = `${t.body(params)}\n\n${mn.email.signature}`;
  return { subject: t.subject, text, html: layout(text) };
}
