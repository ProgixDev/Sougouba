import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importPKCS8, SignJWT } from 'jose';

import type { Env } from '../config/env.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** A push is a courtesy, never the request's real work — see `push.service.ts`. */
const TIMEOUT_MS = 4_000;
/** Google's access tokens last an hour; a new one is fetched a minute before the old one ends. */
const REFRESH_MARGIN_MS = 60_000;

export interface FcmDevice {
  token: string;
  platform: 'ios' | 'android';
}

export interface FcmNotification {
  title: string;
  body: string;
  /** An in-app path the app opens when the notification is tapped. */
  url: string;
  /** The Android channel it is posted on — created by the app under the same id. */
  channel: string;
}

/**
 * - `sent` — Firebase accepted it.
 * - `dead` — Firebase no longer knows the token: the app was uninstalled, or
 *   the token was replaced. The caller forgets it.
 * - `failed` — anything else; the token is kept.
 */
export type FcmOutcome = 'sent' | 'dead' | 'failed';

/**
 * The message Firebase is asked to deliver, shaped for the phone it goes to.
 *
 * The two platforms are not symmetrical, because the app shows notifications
 * through `expo-notifications` and that library reads each platform's payload
 * its own way:
 *
 * - **Android** gets a *data* message. The app's own service receives it —
 *   open, in the background or closed — and builds the notification from
 *   `title`, `message` and `channelId`. `body` is a JSON string and becomes
 *   the notification's data, which is where the app looks for `url`. A
 *   `notification` block would have Android draw it itself, outside the app's
 *   channels and without a tap the app can read.
 * - **iOS** gets a `notification` — Apple draws it, the app is not even
 *   running — and the data under a top-level `body` key of the Apple payload,
 *   which is where `expo-notifications` reads a remote notification's data.
 */
export function fcmMessage(device: FcmDevice, notification: FcmNotification): Record<string, unknown> {
  const data = { url: notification.url };

  if (device.platform === 'android') {
    return {
      token: device.token,
      data: {
        title: notification.title,
        message: notification.body,
        channelId: notification.channel,
        body: JSON.stringify(data),
      },
      // A new order, a courier offer: none of these can wait for the phone to wake on its own.
      android: { priority: 'high' },
    };
  }

  return {
    token: device.token,
    notification: { title: notification.title, body: notification.body },
    apns: {
      headers: { 'apns-push-type': 'alert', 'apns-priority': '10' },
      payload: { aps: { sound: 'default' }, body: data },
    },
  };
}

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * The service account, from `FIREBASE_SERVICE_ACCOUNT_JSON` — the file Firebase
 * downloads, as text or base64. Null when it is absent or unreadable: the
 * caller reports "not configured" rather than failing to start.
 */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  for (const candidate of [text, Buffer.from(text, 'base64').toString('utf8')]) {
    try {
      const json = JSON.parse(candidate) as Record<string, unknown>;
      const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = json;
      if (typeof projectId === 'string' && typeof clientEmail === 'string' && typeof privateKey === 'string') {
        return { projectId, clientEmail, privateKey };
      }
    } catch {
      // Not JSON as it stands: try the next reading.
    }
  }
  return null;
}

/**
 * Firebase Cloud Messaging, the HTTP v1 API.
 *
 * Holds one credential — the project's service account — and trades it for a
 * short-lived access token, which it keeps until just before it expires.
 * Everything here answers with an outcome rather than throwing: see
 * `PushService`, whose callers are always in the middle of something that
 * matters more than a notification.
 */
@Injectable()
export class FcmClient {
  private readonly logger = new Logger(FcmClient.name);
  private readonly account: ServiceAccount | null;
  private access: { token: string; expiresAt: number } | null = null;
  /** One sign-in at a time: a burst of sends after the token lapses shares a single request. */
  private signingIn: Promise<string> | null = null;

  constructor(config: ConfigService<Env, true>) {
    const raw = config.get('FIREBASE_SERVICE_ACCOUNT_JSON', { infer: true });
    this.account = parseServiceAccount(raw);
    if (raw && !this.account) {
      this.logger.error('FIREBASE_SERVICE_ACCOUNT_JSON is set but is not a service-account file: no notification can be sent through Firebase.');
    }
  }

  /** False until the service account is on this server: Firebase tokens are then skipped, loudly. */
  get isConfigured(): boolean {
    return this.account !== null;
  }

  async send(device: FcmDevice, notification: FcmNotification): Promise<FcmOutcome> {
    if (!this.account) return 'failed';
    try {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fcmMessage(device, notification) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return 'sent';

      const error = ((await response.json().catch(() => null)) as FcmErrorBody | null)?.error;
      // Refused as "who are you": the token was revoked early. The next send signs in again.
      if (response.status === 401) this.access = null;
      if (isDeadToken(response.status, error)) return 'dead';

      this.logger.warn(`Firebase refused a notification: HTTP ${response.status} ${error?.status ?? ''} — ${error?.message ?? 'no detail'}`);
      return 'failed';
    } catch (error) {
      this.logger.warn(`Notification not sent through Firebase: ${String(error)}`);
      return 'failed';
    }
  }

  private async accessToken(): Promise<string> {
    if (this.access && this.access.expiresAt - REFRESH_MARGIN_MS > Date.now()) return this.access.token;
    this.signingIn ??= this.signIn().finally(() => {
      this.signingIn = null;
    });
    return this.signingIn;
  }

  /** Google's service-account flow: a JWT signed with the account's key, traded for an access token. */
  private async signIn(): Promise<string> {
    const account = this.account!;
    const key = await importPKCS8(account.privateKey, 'RS256');
    const assertion = await new SignJWT({ scope: MESSAGING_SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(account.clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
    if (!response.ok || !body?.access_token) {
      throw new Error(`Google refused the service account: HTTP ${response.status} ${body?.error_description ?? ''}`.trim());
    }

    this.access = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }
}

interface FcmErrorBody {
  error?: {
    status?: string;
    message?: string;
    details?: { '@type'?: string; errorCode?: string }[];
  };
}

/**
 * Whether Firebase is saying "this token is gone", as opposed to "this request
 * is wrong". Only the first may cost a device its registration.
 */
function isDeadToken(httpStatus: number, error: FcmErrorBody['error']): boolean {
  const code = error?.details?.find((detail) => detail.errorCode)?.errorCode;
  if (code === 'UNREGISTERED' || httpStatus === 404) return true;
  // `INVALID_ARGUMENT` also covers a malformed message — which is our bug, not
  // the phone's. It is the token only when Firebase says so.
  return code === 'INVALID_ARGUMENT' && /registration token/i.test(error?.message ?? '');
}
