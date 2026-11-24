import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { isServerless } from '../../config/runtime.js';
import type { Db } from '../../db/client.js';
import { DB } from '../../db/db.module.js';
import { unwrap } from '../../db/unwrap.js';
import { MailService } from '../../mail/mail.service.js';
import type { Locale } from '../../notifications/messages.js';
import { PaymentsService } from '../payments.service.js';
import { renderReceiptEmail, type ReceiptEmailKind } from './receipt-email.js';
import { receiptLinkKey, signReceiptLink, verifyReceiptLink } from './receipt-link.js';
import { renderReceiptPdf } from './receipt-pdf.js';
import {
  buildReceipt,
  receiptFileName,
  type PlatformIdentity,
  type Receipt,
  type ReceiptItemRow,
  type ReceiptOrderRow,
  type ReceiptRegistrationRow,
  type ReceiptVendorRow,
} from './receipt.js';

/** What `orders` gives a receipt beyond the columns it prints. */
type OrderRow = ReceiptOrderRow & {
  customer_id: string;
  vendor_id: string;
  stripe_payment_intent_id: string | null;
  /** Absent before migration `0051`, like `receipt_number`. */
  receipt_emailed_at?: string | null;
};

/** How long a serverless request waits on the mail before answering anyway. */
const SERVERLESS_MAIL_WAIT_MS = 6_000;

/** The least time between two sends of one receipt from the back office — a double click, or a held-down button. */
const RESEND_COOLDOWN_MS = 60_000;

export interface ReceiptLink {
  /** Relative to the API's own origin — the client already knows where it reached this API. */
  path: string;
  expiresAt: string;
}

/**
 * Receipts: built from an order, emailed when it is paid or refunded, and
 * served as a PDF on demand (CDC module 04, « reçus générés automatiquement »).
 *
 * Nothing is stored except a number and the time the email went out. The
 * document is rendered from the order's own snapshot each time it is asked for.
 *
 * **An email never holds a response.** SMTP from the API's host has taken
 * anywhere from one second to a minute, and the caller here is a shopper
 * watching a checkout spinner. On a long-lived server the send is started and
 * left to finish on its own; on a serverless host — where work outliving the
 * response may never run — the request waits a bounded few seconds for it.
 * Either way a receipt that failed to send costs nothing but the email: the
 * same document is one tap away in the app, and the back office can resend it.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly linkKey: Uint8Array;
  private readonly platform: PlatformIdentity;
  private readonly serverless: boolean;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>
  ) {
    this.linkKey = receiptLinkKey(config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }));
    const optional = (value: string | undefined) => value?.trim() || null;
    this.platform = {
      legalName: optional(config.get('PLATFORM_LEGAL_NAME', { infer: true })),
      address: optional(config.get('PLATFORM_LEGAL_ADDRESS', { infer: true })),
      gstNumber: optional(config.get('PLATFORM_GST_NUMBER', { infer: true })),
      qstNumber: optional(config.get('PLATFORM_QST_NUMBER', { infer: true })),
      supportEmail: optional(config.get('SUPPORT_EMAIL', { infer: true })),
    };
    this.serverless = isServerless({
      VERCEL: config.get('VERCEL', { infer: true }),
      SERVERLESS: config.get('SERVERLESS', { infer: true }),
    });
  }

  // ── links ─────────────────────────────────────────────────────────────────

  /**
   * A link to the shopper's own receipt. Ownership first, as a 404: an order id
   * that exists but belongs to someone else must not answer differently from
   * one that does not exist.
   */
  async linkForCustomer(customerId: string, orderId: string, locale: Locale): Promise<ReceiptLink> {
    const owned = await unwrap<{ id: string } | null>(
      this.db.from('orders').select('id').eq('id', orderId).eq('customer_id', customerId).maybeSingle()
    );
    if (!owned) throw new NotFoundException('Order not found');
    return this.link(orderId, locale);
  }

  /** The back office reads any order's receipt — the route's permission is the gate. */
  async linkForAdmin(orderId: string, locale: Locale): Promise<ReceiptLink> {
    const found = await unwrap<{ id: string } | null>(this.db.from('orders').select('id').eq('id', orderId).maybeSingle());
    if (!found) throw new NotFoundException('Order not found');
    return this.link(orderId, locale);
  }

  private async link(orderId: string, locale: Locale): Promise<ReceiptLink> {
    const { token, expiresAt } = await signReceiptLink({ orderId, locale }, this.linkKey);
    return { path: `/receipts/pdf?token=${encodeURIComponent(token)}`, expiresAt };
  }

  /** The PDF a link points at. A link that is expired, forged or about a vanished order is simply not found. */
  async pdfForLink(token: string): Promise<{ pdf: Buffer; fileName: string }> {
    const claims = await verifyReceiptLink(token, this.linkKey);
    if (!claims) throw new NotFoundException('Ce lien a expiré. Rouvrez le reçu depuis votre commande.');
    const loaded = await this.load(claims.orderId);
    if (!loaded) throw new NotFoundException('Order not found');
    return {
      pdf: await renderReceiptPdf(loaded.receipt, claims.locale),
      fileName: receiptFileName(loaded.receipt, claims.locale),
    };
  }

  // ── emails ────────────────────────────────────────────────────────────────

  /** A paid order has just been written: its receipt goes to the shopper. Never throws. */
  orderPlaced(orderId: string): Promise<void> {
    return this.detached('orderPlaced', () => this.sendAndStamp(orderId, 'receipt'));
  }

  /** Money went back on an order: the shopper is told, with the receipt now showing it. Never throws. */
  orderRefunded(orderId: string): Promise<void> {
    return this.detached('orderRefunded', () => this.sendAndStamp(orderId, 'refund'));
  }

  /**
   * Send the receipt again, from the back office. Unlike the two above this one
   * is awaited and does throw: an administrator pressing "Renvoyer" is waiting
   * to learn whether it went.
   *
   * Audited, like every back-office action that does something: the send time
   * and the audit entry are written together by `admin_receipt_resent`. The
   * mail necessarily goes first — it cannot be part of a transaction — so a
   * failure of that write leaves a receipt sent and unrecorded, which the log
   * line below is the trail for. The same order as a refund, for the same
   * reason: recording first could log a receipt that never left.
   */
  async resend(adminId: string, orderId: string): Promise<{ sentAt: string }> {
    const sent = await this.send(orderId, 'receipt', RESEND_COOLDOWN_MS).catch((error: unknown) => {
      // The mail server refused or could not be reached. Said as that, rather
      // than as the bare 500 an SMTP error would otherwise surface as.
      this.logger.warn(`Receipt of order ${orderId} could not be resent by admin ${adminId}: ${String(error)}`);
      throw new ServiceUnavailableException('Le courriel n’a pas pu être envoyé. Réessayez dans un instant.');
    });
    if (sent === 'no-order') throw new NotFoundException('Order not found');
    if (sent === 'no-email') {
      throw new ServiceUnavailableException('Ce compte n’a plus d’adresse courriel : le reçu ne peut pas être envoyé');
    }
    if (sent === 'too-soon') {
      throw new HttpException(
        { message: 'Ce reçu vient d’être envoyé. Patientez une minute avant de le renvoyer.' },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const { error } = await this.db.rpc('admin_receipt_resent', {
      p_admin_id: adminId,
      p_order_id: orderId,
      p_sent_at: sent.sentAt,
    });
    if (error) {
      this.logger.error(
        `Admin ${adminId} resent the receipt of order ${orderId} at ${sent.sentAt}, but it was NOT recorded: ${error.code} ${error.message}`
      );
      throw new InternalServerErrorException('Le reçu a été envoyé, mais l’envoi n’a pas pu être consigné');
    }
    return sent;
  }

  /** The automatic sends: mail, then note when it went. */
  private async sendAndStamp(orderId: string, kind: ReceiptEmailKind): Promise<void> {
    const sent = await this.send(orderId, kind);
    if (typeof sent === 'string') return;
    // Best effort, and tolerant of a database `0051` has not reached yet: the
    // mail has gone, and failing here would report a sent receipt as unsent.
    const { error } = await this.db.from('orders').update({ receipt_emailed_at: sent.sentAt }).eq('id', orderId);
    if (error) this.logger.warn(`Receipt for order ${orderId} sent, but the send time was not recorded: ${error.message}`);
  }

  private async send(
    orderId: string,
    kind: ReceiptEmailKind,
    /** Refuse when the last send is more recent than this. Only the manual resend asks. */
    cooldownMs?: number
  ): Promise<{ sentAt: string } | 'no-order' | 'no-email' | 'too-soon'> {
    const loaded = await this.load(orderId);
    if (!loaded) return 'no-order';
    if (cooldownMs && loaded.emailedAt && Date.now() - Date.parse(loaded.emailedAt) < cooldownMs) return 'too-soon';

    const [to, locale] = await Promise.all([this.emailOf(loaded.customerId), this.localeOf(loaded.customerId)]);
    // A deleted account keeps its orders but has nowhere to be written to.
    if (!to) return 'no-email';

    // The PDF is the nice-to-have of the two: if it cannot be drawn, the email
    // still carries every figure in its body.
    const pdf = await renderReceiptPdf(loaded.receipt, locale).catch((error: unknown) => {
      this.logger.warn(`Receipt PDF for order ${orderId} could not be rendered: ${String(error)}`);
      return null;
    });

    await this.mail.send({
      to,
      ...renderReceiptEmail(loaded.receipt, locale, kind, pdf !== null),
      ...(pdf && {
        attachments: [{ filename: receiptFileName(loaded.receipt, locale), content: pdf, contentType: 'application/pdf' }],
      }),
    });

    return { sentAt: new Date().toISOString() };
  }

  /**
   * Run a send without making the caller wait on SMTP — see the class comment.
   * The returned promise never rejects.
   */
  private async detached(event: string, work: () => Promise<unknown>): Promise<void> {
    const run = work().then(
      () => undefined,
      (error: unknown) => this.logger.warn(`Receipt email for ${event} skipped: ${String(error)}`)
    );
    if (!this.serverless) return;
    let timer: NodeJS.Timeout | undefined;
    const cap = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SERVERLESS_MAIL_WAIT_MS);
    });
    await Promise.race([run, cap]);
    clearTimeout(timer);
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * Everything a receipt prints, read fresh.
   *
   * `select('*')` on the order rather than a column list on purpose: it keeps
   * working against a database that does not have `receipt_number` yet, where
   * naming the column would fail the whole read.
   */
  async load(orderId: string): Promise<{ receipt: Receipt; customerId: string; emailedAt: string | null } | null> {
    const order = await unwrap<OrderRow | null>(this.db.from('orders').select('*').eq('id', orderId).maybeSingle());
    if (!order) return null;

    const [items, vendor, registration, payment] = await Promise.all([
      unwrap<ReceiptItemRow[]>(
        this.db.from('order_items').select('name, qty, unitPriceCad:unit_price_cad').eq('order_id', orderId)
      ),
      unwrap<ReceiptVendorRow | null>(
        this.db
          .from('vendors')
          .select('name, city, addressStreet:address_street, addressPostalCode:address_postal_code')
          .eq('id', order.vendor_id)
          .maybeSingle()
      ),
      unwrap<ReceiptRegistrationRow | null>(
        this.db
          .from('vendor_registrations')
          .select('legalName:legal_name, gstNumber:gst_number, qstNumber:qst_number')
          .eq('vendor_id', order.vendor_id)
          .maybeSingle()
      ),
      this.payments.describePayment(order.stripe_payment_intent_id),
    ]);

    return {
      receipt: buildReceipt({ order, items, vendor, registration, platform: this.platform, payment }),
      customerId: order.customer_id,
      emailedAt: order.receipt_emailed_at ?? null,
    };
  }

  /** The account's sign-in address — the only one the platform holds for a shopper. */
  private async emailOf(userId: string): Promise<string | null> {
    const { data } = await this.db.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  }

  /**
   * The language to write in: whichever the shopper's phone last showed the app
   * in, which is where push notifications already take theirs from. French for
   * an account that never registered a device.
   */
  private async localeOf(userId: string): Promise<Locale> {
    const { data } = await this.db
      .from('push_tokens')
      .select('locale')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.locale === 'en' ? 'en' : 'fr';
  }
}
