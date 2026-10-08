import nodemailer from 'nodemailer';
import type { Env } from '../env';
import type { RenderedEmail } from './templates';

export interface Mailer {
  send(to: string, email: RenderedEmail): Promise<void>;
}

/** SMTP mailer: Mailpit locally, any SMTP provider in production (env only). */
export function createSmtpMailer(env: Env): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
  });

  return {
    async send(to, { subject, text, html }) {
      await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
    },
  };
}
