import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import type { Db, Tables } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import type { RegisterPushTokenInput } from './dto/push-token.dto.js';
import { FcmClient, type FcmDevice } from './fcm.client.js';
import type { Locale } from './messages.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH = 100;

/** Firebase takes one message per request; this many are in flight at once. */
const FCM_CONCURRENCY = 10;

/** What `getExpoPushTokenAsync` returns — the token of a build made before Firebase was added. */
const isExpoToken = (token: string) => /^Expo(nent)?PushToken\[/.test(token);

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
 * Sends push notifications through **Firebase Cloud Messaging**, to Android
 * and iOS alike (`fcm.client.ts`). Firebase reaches an iPhone through Apple,
 * with the APNs key uploaded in the Firebase console; this server holds one
 * credential, the project's service account.
 *
 * A build made before Firebase was added registers a token from Expo's push
 * service instead. Those are still sent through Expo, exactly as before, so
 * no phone goes quiet on the day this ships; that road closes by itself as the
 * old builds are replaced, and `deliverThroughExpo` can then be deleted.
 *
 * **Never throws.** Every caller is in the middle of something that matters
 * more — an order being placed, a delivery being closed — and a failed push
 * must not fail it. Errors are logged and swallowed.
 *
 * A token Firebase (or Expo) reports gone is deleted. Whether a notification
 * that was accepted actually reached the phone is not followed up.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly accessToken: string | undefined;
  private warnedNoFirebase = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    config: ConfigService<Env, true>,
    private readonly fcm: FcmClient,
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
        .select('token, locale, platform')
        .in('user_id', recipients);
      if (message.category)
        query = query.eq(CATEGORY_COLUMN[message.category], true);
      const devices = await unwrap<
        { token: string; locale: string; platform: string }[]
      >(query);
      if (devices.length === 0) return;

      const written = devices.map((device) => ({
        token: device.token,
        platform: device.platform === 'ios' ? ('ios' as const) : ('android' as const),
        ...message.content(device.locale === 'en' ? 'en' : 'fr'),
      }));

      await this.deliverThroughFirebase(
        written.filter((device) => !isExpoToken(device.token)),
        message,
      );

      const legacy = written
        .filter((device) => isExpoToken(device.token))
        .map(({ token, title, body }) => ({
          to: token,
          title,
          body,
          data: { url: message.url },
          sound: 'default',
          priority: 'high',
          channelId: message.channel,
        }));
      for (let i = 0; i < legacy.length; i += EXPO_BATCH) {
        await this.deliverThroughExpo(legacy.slice(i, i + EXPO_BATCH));
      }
    } catch (error) {
      this.logger.warn(`Push not sent: ${String(error)}`);
    }
  }

  /** One request per device, a few at a time; tokens Firebase no longer knows are forgotten. */
  private async deliverThroughFirebase(
    devices: (FcmDevice & { title: string; body: string })[],
    message: PushMessage,
  ): Promise<void> {
    if (devices.length === 0) return;
    if (!this.fcm.isConfigured) {
      // Said once per process, not once per notification.
      if (!this.warnedNoFirebase) {
        this.warnedNoFirebase = true;
        this.logger.error(
          'Phones are registered with Firebase but FIREBASE_SERVICE_ACCOUNT_JSON is not set on this server: their notifications are not being sent.',
        );
      }
      return;
    }

    const dead: string[] = [];
    for (let i = 0; i < devices.length; i += FCM_CONCURRENCY) {
      const outcomes = await Promise.all(
        devices.slice(i, i + FCM_CONCURRENCY).map(async (device) => ({
          token: device.token,
          outcome: await this.fcm.send(device, {
            title: device.title,
            body: device.body,
            url: message.url,
            channel: message.channel,
          }),
        })),
      );
      dead.push(
        ...outcomes.filter((o) => o.outcome === 'dead').map((o) => o.token),
      );
    }

    // An uninstalled app, or a token the system replaced. Keeping it would
    // mean paying a request per push for a device that will never show it.
    if (dead.length > 0) {
      await unwrap(this.db.from('push_tokens').delete().in('token', dead));
    }
  }

  /** The road for builds that predate Firebase — see the note on the class. */
  private async deliverThroughExpo(batch: { to: string }[]): Promise<void> {
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
