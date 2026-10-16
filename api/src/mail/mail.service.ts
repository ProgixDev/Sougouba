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
 * it is refused in production unless `ALLOW_FIXED_TEST_OTP` says the deploy is
 * a test one: otherwise a sign-up code that only reaches a server log is a
 * sign-up nobody can finish.
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
      // Simulated mail in production is normally a refusal to boot: a sign-up
      // code that only reaches a server log is a sign-up nobody can finish.
      // `ALLOW_FIXED_TEST_OTP` is the deliberate exception for the test-phase
      // deploy, where `SignupService` accepts 000000 for every account instead
      // of mailing anything.
      if (config.get('NODE_ENV', { infer: true }) === 'production') {
        if (!truthy(config.get('ALLOW_FIXED_TEST_OTP', { infer: true }))) {
          throw new Error('SMTP_HOST must be set in production — sign-up codes would never reach anyone.');
        }
        // Not `warn`: this is the loudest line in the boot log on purpose.
        // Anyone reading it should be able to tell that the front door is open.
        this.logger.error(
          'ALLOW_FIXED_TEST_OTP is set: no email is sent and the code 000000 signs in as ANY account. ' +
            'Unset it before delivery.'
        );
      } else {
        this.logger.warn('SMTP_HOST is empty — emails are simulated and printed here instead of sent.');
      }
      this.transport = null;
    }
  }

  /**
   * True when nothing is really sent — no `SMTP_HOST`. In production this
   * requires `ALLOW_FIXED_TEST_OTP`; the constructor refuses otherwise.
   *
   * `SignupService` reads this to decide between the fixed 000000 code and a
   * random one, so the two cannot drift apart: a deploy that mails codes never
   * accepts 000000, and one that accepts 000000 never pretends to mail.
   */
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

/**
 * Reads a flag-shaped environment string. Mirrors `config/runtime.ts` so that
 * '0', 'false' and an empty value all mean off, rather than the surprise where
 * `ALLOW_FIXED_TEST_OTP=0` leaves the bypass on.
 */
function truthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}
