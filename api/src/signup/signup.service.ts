import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isBanned } from '../auth/banned.js';
import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapVoid } from '../db/unwrap.js';
import { MailService } from '../mail/mail.service.js';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
/** Wrong guesses allowed per code. Five out of a million, then a new code is needed. */
const MAX_ATTEMPTS = 5;
/** The fixed code while email is simulated. See `start`. */
const SIMULATED_CODE = '000000';

type PendingRow = { code_hash: string; expires_at: string; attempts: number; sent_at: string };

export interface EmailSession {
  accessToken: string;
  refreshToken: string;
  /** No name on the profile yet — the app asks for one before going further. */
  isNewUser: boolean;
}

/**
 * Passwordless email sign-in, which is also sign-up: one 6-digit code, issued
 * and checked here. Supabase Auth sends nothing.
 *
 * `start` never says whether the address has an account — it answers the same
 * either way. The account is found or created only in `verify`, once the code
 * has proved the caller reads that inbox, and only then does the response
 * reveal whether it is new.
 *
 * ── How a session is minted without a password ─────────────────────────────
 *
 * Supabase has no "create a session for this user" admin call. The standard
 * route is `auth.admin.generateLink({ type: 'magiclink' })`, which returns the
 * link's `hashed_token` **without sending the mail**, then `verifyOtp` with
 * that hash, which exchanges it for a real session (and confirms the address).
 * The tokens are handed to the app, which installs them with `setSession`, so
 * the rest of the app — and this API's JWKS guard — see an ordinary session.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);
  private readonly hmacKey: string;
  /**
   * A second client just for `verifyOtp`: that call stores the resulting
   * session on the client it runs on, and the shared `DB` client must stay
   * sessionless — otherwise every later query would run as the last user who
   * signed in rather than as `service_role`.
   */
  private readonly exchanger: SupabaseClient;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly mail: MailService,
    config: ConfigService<Env, true>
  ) {
    const url = config.get('SUPABASE_URL', { infer: true });
    this.hmacKey = config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
    this.exchanger = createClient(url, this.hmacKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async start(email: string): Promise<void> {
    const pending = await this.pending(email);
    if (pending) {
      const waitMs = Date.parse(pending.sent_at) + RESEND_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        throw new HttpException(
          { message: `Patientez ${Math.ceil(waitMs / 1000)} s avant de redemander un code.` },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    // While mail is simulated (local development — production refuses to boot
    // without SMTP) the code is always 000000, so anyone testing can get in
    // without reading the server console. Both read the same `mail.simulated`,
    // so a deploy that mails codes can never accept six zeros.
    const code = this.mail.simulated ? SIMULATED_CODE : randomInt(0, 1_000_000).toString().padStart(6, '0');
    await unwrapVoid(
      this.db.from('email_verification_codes').upsert({
        email,
        code_hash: this.hash(email, code),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        attempts: 0,
        sent_at: new Date().toISOString(),
      })
    );

    await this.mail.send({
      to: email,
      subject: `${code} — votre code Sougouba`,
      text:
        `Votre code de connexion Sougouba : ${code}\n\n` +
        `Il expire dans 10 minutes. Si vous n'avez rien demandé, ignorez ce message.\n\n` +
        `Your Sougouba sign-in code: ${code} (expires in 10 minutes).`,
    });
  }

  async verify(email: string, code: string): Promise<EmailSession> {
    const pending = await this.pending(email);
    if (!pending || Date.parse(pending.expires_at) < Date.now() || pending.attempts >= MAX_ATTEMPTS) {
      throw new GoneException('Ce code a expiré. Demandez-en un nouveau.');
    }

    if (!this.matches(pending.code_hash, email, code)) {
      await unwrapVoid(
        this.db
          .from('email_verification_codes')
          .update({ attempts: pending.attempts + 1 })
          .eq('email', email)
      );
      throw new BadRequestException('Code incorrect.');
    }

    // Spent before the session is minted, so a code can never be replayed —
    // even if what follows fails and the person has to ask for a new one.
    await unwrapVoid(this.db.from('email_verification_codes').delete().eq('email', email));

    // Created explicitly rather than left to `generateLink`, which refuses to
    // create accounts when "Allow new users to sign up" is off in the dashboard
    // — and that setting *should* be off, so nobody can sign up around this API.
    const created = await this.db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && created.error.code !== 'email_exists') {
      this.logger.error(`createUser failed: ${created.error.code} ${created.error.message}`);
      throw new InternalServerErrorException('Impossible de vous connecter.');
    }

    const link = await this.db.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) {
      this.logger.error(`generateLink failed: ${link.error?.code} ${link.error?.message}`);
      throw new InternalServerErrorException('Impossible de vous connecter.');
    }

    // A blocked account (an administrator's ban, `setUserBlocked`) would fail
    // the exchange below with a generic error; say what actually happened.
    if (isBanned(link.data.user?.banned_until)) {
      throw new ForbiddenException('Ce compte a été bloqué. Contactez le support Sougouba.');
    }

    const { data, error } = await this.exchanger.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    if (error || !data.session || !data.user) {
      this.logger.error(`verifyOtp failed: ${error?.code} ${error?.message}`);
      throw new InternalServerErrorException('Impossible de vous connecter.');
    }

    const profile = await unwrap<{ full_name: string } | null>(
      this.db.from('profiles').select('full_name').eq('id', data.user.id).maybeSingle()
    );

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      isNewUser: !profile?.full_name.trim(),
    };
  }

  private async pending(email: string): Promise<PendingRow | null> {
    return unwrap<PendingRow | null>(
      this.db
        .from('email_verification_codes')
        .select('code_hash, expires_at, attempts, sent_at')
        .eq('email', email)
        .maybeSingle()
    );
  }

  /** Bound to the address, so a hash copied onto another row verifies nothing. */
  private hash(email: string, code: string): string {
    return createHmac('sha256', this.hmacKey).update(`${email}:${code}`).digest('hex');
  }

  private matches(storedHex: string, email: string, code: string): boolean {
    const stored = Buffer.from(storedHex, 'hex');
    const given = Buffer.from(this.hash(email, code), 'hex');
    return stored.length === given.length && timingSafeEqual(stored, given);
  }
}
