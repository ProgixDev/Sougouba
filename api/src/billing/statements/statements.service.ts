import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import type { Db, Tables } from '../../db/client.js';
import { DB } from '../../db/db.module.js';
import { unwrap } from '../../db/unwrap.js';
import { SettingsService } from '../../loyalty/settings.service.js';
import { MailService } from '../../mail/mail.service.js';
import type { Locale } from '../../notifications/messages.js';
import { receiptLinkKey, signStatementLink, verifyStatementLink } from '../../orders/receipts/receipt-link.js';
import { renderStatementEmail } from './statement-email.js';
import { renderStatementPdf } from './statement-pdf.js';
import {
  buildStatement,
  currentPeriod,
  formatStatementNumber,
  isEmpty,
  periodWindow,
  statementFileName,
  type PeriodWindow,
  type Statement,
  type StatementLines,
  type StatementOrderRow,
  type StatementRefundRow,
  type StatementTotals,
} from './statement.js';

type StatementRow = Tables<'merchant_statements'>;

/** A statement as a list shows it: the month, the figures, and whether it was sent. */
export interface StatementSummary {
  id: string;
  number: string | null;
  /** `2026-11`. */
  period: string;
  issuedAt: string;
  emailedAt: string | null;
  totals: StatementTotals;
}

export interface StatementLink {
  /** Relative to the API's own origin, like a receipt link. */
  path: string;
  expiresAt: string;
}

const UNIQUE_VIOLATION = '23505';
/** PostgREST returns at most this many rows per request; a busy shop's month is read in pages of it. */
const PAGE = 1000;

const ORDER_COLUMNS =
  'id, receipt_number, subtotal_cad, gst_cad, qst_cad, delivery_fee_cad, total_cad, points_discount_cad, coupon_discount_cad, commission_cad, merchant_paid_cad, history:order_status_history!inner(status, at)';

/**
 * Merchant statements (CDC module 04, « facturation générée automatiquement »).
 *
 * On the 1st of each month, every shop that had an order delivered or a refund
 * issued the month before gets a statement: frozen in `merchant_statements`,
 * numbered, and emailed as a PDF. The figures and the rules behind them are in
 * `statement.ts`; this class reads the rows, stores the result and sends it.
 *
 * Until the month closes, the same sum is offered live as the "month so far",
 * so a merchant is not left looking at an empty screen for thirty days.
 */
@Injectable()
export class StatementsService {
  private readonly logger = new Logger(StatementsService.name);
  private readonly linkKey: Uint8Array;
  private readonly platform: Statement['platform'];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>
  ) {
    this.linkKey = receiptLinkKey(config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }));
    const optional = (value: string | undefined) => value?.trim() || null;
    this.platform = {
      legalName: optional(config.get('PLATFORM_LEGAL_NAME', { infer: true })),
      address: optional(config.get('PLATFORM_LEGAL_ADDRESS', { infer: true })),
      supportEmail: optional(config.get('SUPPORT_EMAIL', { infer: true })),
    };
  }

  // ── the merchant ──────────────────────────────────────────────────────────

  /** The caller's shop: the month so far, then every statement issued, newest first. */
  async listFor(userId: string): Promise<{ current: { period: string; totals: StatementTotals }; statements: StatementSummary[] }> {
    const vendorId = await this.vendorIdOf(userId);
    const window = periodWindow(currentPeriod(new Date()));
    const [{ totals }, statements] = await Promise.all([this.compute(vendorId, window), this.issuedFor(vendorId)]);
    return { current: { period: window.period, totals }, statements };
  }

  /** A link to one of the caller's own statements. Someone else's is a 404, like a receipt. */
  async linkForMerchant(userId: string, statementId: string, locale: Locale): Promise<StatementLink> {
    const vendorId = await this.vendorIdOf(userId);
    const owned = await unwrap<{ id: string } | null>(
      this.db.from('merchant_statements').select('id').eq('id', statementId).eq('vendor_id', vendorId).maybeSingle()
    );
    if (!owned) throw new NotFoundException('Statement not found');
    return this.link(statementId, locale);
  }

  // ── the back office ───────────────────────────────────────────────────────

  /** Every statement issued to a shop. The route's permission is the gate. */
  issuedFor(vendorId: string): Promise<StatementSummary[]> {
    return unwrap<StatementRow[]>(
      this.db.from('merchant_statements').select('*').eq('vendor_id', vendorId).order('period_start', { ascending: false })
    ).then((rows) => rows.map(toSummary));
  }

  async linkForAdmin(statementId: string): Promise<StatementLink> {
    const found = await unwrap<{ id: string } | null>(
      this.db.from('merchant_statements').select('id').eq('id', statementId).maybeSingle()
    );
    if (!found) throw new NotFoundException('Statement not found');
    return this.link(statementId, 'fr');
  }

  // ── the link ──────────────────────────────────────────────────────────────

  private async link(statementId: string, locale: Locale): Promise<StatementLink> {
    const { token, expiresAt } = await signStatementLink({ statementId, locale }, this.linkKey);
    return { path: `/statements/pdf?token=${encodeURIComponent(token)}`, expiresAt };
  }

  async pdfForLink(token: string): Promise<{ pdf: Buffer; fileName: string }> {
    const claims = await verifyStatementLink(token, this.linkKey);
    if (!claims) throw new NotFoundException('Ce lien a expiré. Rouvrez le relevé depuis votre espace.');
    const statement = await this.load(claims.statementId);
    if (!statement) throw new NotFoundException('Statement not found');
    return { pdf: await renderStatementPdf(statement, claims.locale), fileName: statementFileName(statement, claims.locale) };
  }

  // ── closing a month ───────────────────────────────────────────────────────

  /**
   * Issue the statements for a month that is over, and email them.
   *
   * Safe to run twice: a shop's statement for a month exists once (the table
   * says so), a second run finds it rather than issuing another, and an email
   * goes out only for a statement that has not been sent. So a run that died
   * halfway is finished by running it again.
   *
   * Refused for a month still in progress — its figures are not final, and a
   * frozen statement is exactly what must not be issued from moving numbers.
   */
  async closeMonth(period: string, options: { email: boolean }): Promise<{ period: string; issued: number; emailed: number; empty: number }> {
    const window = periodWindow(period);
    if (window.end.getTime() > Date.now()) {
      throw new BadRequestException(`Le mois ${window.period} n’est pas terminé : son relevé ne peut pas encore être émis`);
    }

    // Every shop, whatever its standing today: one suspended last week still
    // delivered orders this month and is still owed for them.
    const vendors = await unwrap<{ id: string }[]>(this.db.from('vendors').select('id'));
    const result = { period: window.period, issued: 0, emailed: 0, empty: 0 };

    for (const vendor of vendors) {
      try {
        const row = await this.issue(vendor.id, window);
        if (!row) {
          result.empty++;
          continue;
        }
        result.issued++;
        if (options.email && !row.emailed_at && (await this.send(row))) result.emailed++;
      } catch (error) {
        // One shop's failure must not cost the others their statement.
        this.logger.error(`Statement ${window.period} for vendor ${vendor.id} failed: ${String(error)}`);
      }
    }
    this.logger.log(`Statements for ${window.period}: ${JSON.stringify(result)}`);
    return result;
  }

  /** The shop's statement for the month — the existing one, or a new one. Null when the month was empty. */
  private async issue(vendorId: string, window: PeriodWindow): Promise<StatementRow | null> {
    const existing = await this.row(vendorId, window);
    if (existing) return existing;

    const { totals, lines } = await this.compute(vendorId, window);
    if (isEmpty(totals)) return null;

    const { data, error } = await this.db
      .from('merchant_statements')
      .insert({
        vendor_id: vendorId,
        period_start: window.startDate,
        period_end: window.endDate,
        totals: totals as never,
        lines: lines as never,
      })
      .select('*')
      .single();
    if (error) {
      // Another run issued it between the check above and this insert.
      if (error.code === UNIQUE_VIOLATION) return this.row(vendorId, window);
      throw new Error(`could not store the statement: ${error.code} ${error.message}`);
    }
    return data;
  }

  private row(vendorId: string, window: PeriodWindow): Promise<StatementRow | null> {
    return unwrap<StatementRow | null>(
      this.db.from('merchant_statements').select('*').eq('vendor_id', vendorId).eq('period_start', window.startDate).maybeSingle()
    );
  }

  /** Email one statement to the shop's owner. False — and logged — when it could not go. */
  private async send(row: StatementRow): Promise<boolean> {
    const statement = await this.load(row.id);
    if (!statement) return false;

    const owner = await unwrap<{ ownerId: string } | null>(
      this.db.from('vendors').select('ownerId:owner_id').eq('id', row.vendor_id).maybeSingle()
    );
    if (!owner) return false;
    const [{ data: account }, locale] = await Promise.all([this.db.auth.admin.getUserById(owner.ownerId), this.localeOf(owner.ownerId)]);
    const to = account?.user?.email;
    // A deleted account keeps its statements but has nowhere to be written to.
    if (!to) return false;

    const pdf = await renderStatementPdf(statement, locale).catch((error: unknown) => {
      this.logger.warn(`Statement ${row.id} PDF could not be rendered: ${String(error)}`);
      return null;
    });
    const email = renderStatementEmail(statement, locale, pdf !== null);
    await this.mail.send({
      to,
      ...email,
      attachments: [
        ...email.attachments,
        ...(pdf ? [{ filename: statementFileName(statement, locale), content: pdf, contentType: 'application/pdf' }] : []),
      ],
    });

    const { error } = await this.db.from('merchant_statements').update({ emailed_at: new Date().toISOString() }).eq('id', row.id);
    if (error) this.logger.warn(`Statement ${row.id} sent, but the send time was not recorded: ${error.message}`);
    return true;
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * A shop's month, added up from the orders delivered and the refunds issued
   * in it. Only orders with a payment behind them — see `statement.ts`.
   */
  private async compute(vendorId: string, window: PeriodWindow): Promise<{ totals: StatementTotals; lines: StatementLines }> {
    const start = window.start.toISOString();
    const end = window.end.toISOString();

    const [delivered, refunds, { commissionRate }] = await Promise.all([
      this.pages<StatementOrderRow & { history: { at: string }[] }>((from, to) =>
        this.db
          .from('orders')
          .select(ORDER_COLUMNS)
          .eq('vendor_id', vendorId)
          .not('stripe_payment_intent_id', 'is', null)
          // An inner embed filters the orders themselves: only those whose
          // history holds a `delivered` step inside the window.
          .eq('history.status', 'delivered')
          .gte('history.at', start)
          .lt('history.at', end)
          .order('id', { ascending: true })
          .range(from, to)
      ),
      this.pages<StatementRefundRow>((from, to) =>
        this.db
          .from('orders')
          .select('id, receipt_number, refunded_at, refund_amount_cad, total_cad')
          .eq('vendor_id', vendorId)
          .not('stripe_payment_intent_id', 'is', null)
          .gte('refunded_at', start)
          .lt('refunded_at', end)
          .order('id', { ascending: true })
          .range(from, to)
      ),
      this.settings.all(),
    ]);

    return buildStatement({
      orders: delivered.map(({ history, ...order }) => ({ ...order, deliveredAt: history[0]?.at ?? start })),
      refunds,
      commissionRate,
    });
  }

  /** Every row of a query, however many pages it takes. */
  private async pages<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await unwrap<T[]>(query(from, from + PAGE - 1) as never);
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  /** A stored statement, with the shop it is addressed to, ready to draw. */
  private async load(statementId: string): Promise<Statement | null> {
    const row = await unwrap<StatementRow | null>(this.db.from('merchant_statements').select('*').eq('id', statementId).maybeSingle());
    if (!row) return null;

    const [vendor, registration] = await Promise.all([
      unwrap<{ name: string; city: string | null; addressStreet: string | null; addressPostalCode: string | null } | null>(
        this.db
          .from('vendors')
          .select('name, city, addressStreet:address_street, addressPostalCode:address_postal_code')
          .eq('id', row.vendor_id)
          .maybeSingle()
      ),
      unwrap<{ legalName: string | null } | null>(
        this.db.from('vendor_registrations').select('legalName:legal_name').eq('vendor_id', row.vendor_id).maybeSingle()
      ),
    ]);

    return {
      number: formatStatementNumber(row.number),
      period: row.period_start.slice(0, 7) as Statement['period'],
      issuedAt: row.created_at,
      shop: {
        name: vendor?.name ?? 'Sougouba',
        legalName: registration?.legalName?.trim() || null,
        street: vendor?.addressStreet ?? null,
        city: vendor?.city ?? null,
        postalCode: vendor?.addressPostalCode ?? null,
      },
      platform: this.platform,
      totals: row.totals as unknown as StatementTotals,
      lines: row.lines as unknown as StatementLines,
    };
  }

  private async vendorIdOf(userId: string): Promise<string> {
    const vendor = await unwrap<{ id: string } | null>(this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle());
    if (!vendor) throw new NotFoundException('This account has no shop');
    return vendor.id;
  }

  /** The language of the owner's phone, as for a receipt; French for an account with no device. */
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

function toSummary(row: StatementRow): StatementSummary {
  return {
    id: row.id,
    number: formatStatementNumber(row.number),
    period: row.period_start.slice(0, 7),
    issuedAt: row.created_at,
    emailedAt: row.emailed_at,
    totals: row.totals as unknown as StatementTotals,
  };
}
