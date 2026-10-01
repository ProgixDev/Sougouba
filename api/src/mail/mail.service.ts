import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import type { Env } from '../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * The API's one way to send an email.
 *
 * Real delivery through Nodemailer when `SMTP_HOST` is set; otherwise
 * **simulated** — the message is written to the console and nothing leaves the
 * machine. Simulated is the intended state until a mail provider is chosen, and
 * it is refused in production: a sign-up code that only reaches a server log is
 * a sign-up nobody can finish.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    const port = config.get('SMTP_PORT', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    const pass = config.get('SMTP_PASS', { infer: true });

    this.from = config.get('MAIL_FROM', { infer: true }) || user || 'Sougouba <no-reply@sougouba.local>';

    if (host) {
      this.transport = nodemailer.createTransport({
        host,
        port,
        // 465 is implicit TLS; 587 and 25 upgrade with STARTTLS.
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
      });
    } else {
      if (config.get('NODE_ENV', { infer: true }) === 'production') {
        throw new Error('SMTP_HOST must be set in production — sign-up codes would never reach anyone.');
      }
      this.transport = null;
      this.logger.warn('SMTP_HOST is empty — emails are simulated and printed here instead of sent.');
    }
  }

  /** True when nothing is really sent — no `SMTP_HOST`. Never true in production (the constructor refuses). */
  get simulated(): boolean {
    return this.transport === null;
  }

  async send(mail: Mail): Promise<void> {
    if (!this.transport) {
      this.logger.log(`[simulated] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
      return;
    }
    await this.transport.sendMail({ from: this.from, ...mail });
  }
}
