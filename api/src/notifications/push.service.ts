import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import type { Db, Tables } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import type { RegisterPushTokenInput } from './dto/push-token.dto.js';
import type { Locale } from './messages.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH = 100;

/**
 * A push is a courtesy, never the request's real work — so it gets a short
 * leash. A slow Expo must not turn a merchant's "accept order" tap into a
 * ten-second spinner.
 */
const SEND_TIMEOUT_MS = 4_000;

/**
 * The four switches on the shopper's notification screen. Merchant and courier
 * pushes (a new order, a delivery offer) carry no category: they are the job
 * itself, not something to opt out of.
 */
export type PushCategory =
  'orderUpdates' | 'deliveryAlerts' | 'promotions' | 'newVendors';

const CATEGORY_COLUMN = {
  orderUpdates: 'order_updates',
  deliveryAlerts: 'delivery_alerts',
  promotions: 'promotions',
  newVendors: 'new_vendors',
} as const satisfies Record<PushCategory, keyof Tables<'push_tokens'>>;

/** Android channels — created by the app (`lib/push.ts`) under the same ids. */
export type PushChannel = 'orders' | 'offers';

export interface PushContent {
  title: string;
  body: string;
}

export interface PushMessage {
  /** Rendered per device, in the language that device last showed. */
  content: (locale: Locale) => PushContent;
  /** An in-app path the app opens when the notification is tapped. */
  url: string;
  channel: PushChannel;
  /** Omitted for operational pushes, which ignore the shopper's switches. */
  category?: PushCategory;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Sends push notifications through Expo's push service, which forwards to FCM
 * on Android and APNs on iOS. The platform credentials (an FCM v1 service
 * account, an APNs key) live in the EAS project, not here — this process only
 * ever holds Expo tokens.
 *
 * **Never throws.** Every caller is in the middle of something that matters
 * more — an order being placed, a delivery being closed — and a failed push
 * must not fail it. Errors are logged and swallowed.
 *
 * Receipts are not polled. A ticket's `DeviceNotRegistered` is acted on (the
 * token is deleted); a delivery failure reported later, in the receipt, is not.
 * That is the gap to close if pushes ever need to be audited.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly accessToken: string | undefined;

  constructor(
    @Inject(DB) private readonly db: Db,
    config: ConfigService<Env, true>,
  ) {
    // Only required once "Enhanced security for push notifications" is turned
    // on in the Expo project. Without it, anyone holding a token can push to
    // it — which is one more reason tokens never leave this database.
    this.accessToken =
      config.get('EXPO_ACCESS_TOKEN', { infer: true }) || undefined;
  }

  // ── the device registry ───────────────────────────────────────────────────

  /**
   * Remember this device for this account, with its language and switches.
   *
   * An upsert on the token: a phone that signs into a second account moves to
   * it, rather than receiving both accounts' orders.
   */
  async register(
    userId: string,
    input: RegisterPushTokenInput,
  ): Promise<{ registered: true }> {
    const prefs = input.preferences;
    await unwrap(
      this.db.from('push_tokens').upsert(
        {
          token: input.token,
          user_id: userId,
          platform: input.platform,
          locale: input.locale,
          ...(prefs && {
            order_updates: prefs.orderUpdates,
            delivery_alerts: prefs.deliveryAlerts,
            promotions: prefs.promotions,
            new_vendors: prefs.newVendors,
          }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      ),
    );
    return { registered: true };
  }

  /** Sign-out. Scoped to the caller, so one account cannot unregister another's device. */
  async unregister(
    userId: string,
    token: string,
  ): Promise<{ unregistered: true }> {
    await unwrap(
      this.db
        .from('push_tokens')
        .delete()
        .eq('token', token)
        .eq('user_id', userId),
    );
    return { unregistered: true };
  }

  // ── sending ───────────────────────────────────────────────────────────────

  /** Push one message to every device of every listed account that wants it. */
  async send(userIds: string[], message: PushMessage): Promise<void> {
    const recipients = [...new Set(userIds.filter(Boolean))];
    if (recipients.length === 0) return;

    try {
      let query = this.db
        .from('push_tokens')
        .select('token, locale')
        .in('user_id', recipients);
      if (message.category)
        query = query.eq(CATEGORY_COLUMN[message.category], true);
      const devices = await unwrap<{ token: string; locale: string }[]>(query);
      if (devices.length === 0) return;

      const payloads = devices.map((device) => {
        const { title, body } = message.content(
          device.locale === 'en' ? 'en' : 'fr',
        );
        return {
          to: device.token,
          title,
          body,
          data: { url: message.url },
          sound: 'default',
          priority: 'high',
          channelId: message.channel,
        };
      });

      for (let i = 0; i < payloads.length; i += EXPO_BATCH) {
        await this.deliver(payloads.slice(i, i + EXPO_BATCH));
      }
    } catch (error) {
      this.logger.warn(`Push not sent: ${String(error)}`);
    }
  }

  private async deliver(batch: { to: string }[]): Promise<void> {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.accessToken && {
          Authorization: `Bearer ${this.accessToken}`,
        }),
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      this.logger.warn(
        `Expo push refused a batch of ${batch.length}: HTTP ${response.status}`,
      );
      return;
    }

    // Tickets come back in the order the messages went out.
    const { data } = (await response.json()) as { data?: ExpoTicket[] };
    const dead = (data ?? [])
      .map((ticket, i) =>
        ticket.details?.error === 'DeviceNotRegistered' ? batch[i]?.to : null,
      )
      .filter((token): token is string => !!token);

    // An uninstalled app, or a phone that revoked permission. Keeping the token
    // would mean paying a request per push for a device that will never show it.
    if (dead.length > 0) {
      await unwrap(this.db.from('push_tokens').delete().in('token', dead));
    }

    const failed = (data ?? []).filter(
      (t) => t.status === 'error' && t.details?.error !== 'DeviceNotRegistered',
    );
    if (failed.length > 0) {
      this.logger.warn(
        `Expo push: ${failed.length} ticket(s) failed — ${failed[0].message ?? failed[0].details?.error}`,
      );
    }
  }
}
