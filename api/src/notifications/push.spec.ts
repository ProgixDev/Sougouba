import { afterEach, describe, expect, it, vi } from 'vitest';

import { orderReference as appOrderReference } from '../../../lib/orderRef.js';
import {
  courierCopy,
  customerCopy,
  merchantCopy,
  money,
  orderReference,
} from './messages.js';
import { FcmClient, fcmMessage, parseServiceAccount } from './fcm.client.js';
import { PushService } from './push.service.js';

describe('orderReference', () => {
  it("matches the app's reference byte for byte, so a push and a receipt name the order alike", () => {
    for (const id of [
      '1f0c8a52-6c2e-4f6b-9a51-2b7e3d1c9e01',
      'ord_g3_004',
      'x',
    ]) {
      expect(orderReference(id)).toBe(appOrderReference({ id } as never));
    }
  });
});

describe('copy', () => {
  it('writes dollars the way each language does', () => {
    expect(money(12.5, 'fr')).toMatch(/^12,50\s\$$/);
    expect(money(12.5, 'en')).toBe('$12.50');
  });

  it('pluralises the merchant line', () => {
    expect(
      merchantCopy.newOrder({ ref: '#A1B2', items: 1, totalCad: 9 }, 'fr').body,
    ).toContain('1 article ·');
    expect(
      merchantCopy.newOrder({ ref: '#A1B2', items: 3, totalCad: 9 }, 'en').body,
    ).toContain('3 items');
  });

  it('renders each event in both languages', () => {
    const params = { ref: '#A1B2', vendor: 'Épicerie Dakar' };
    expect(customerCopy.confirmed(params, 'fr').title).toBe(
      'Commande acceptée',
    );
    expect(customerCopy.confirmed(params, 'en').title).toBe('Order accepted');
    // Accepted and being prepared are two pushes now: the first must not
    // announce what the second is for.
    expect(customerCopy.confirmed(params, 'fr').body).toBe(
      'Épicerie Dakar a accepté votre commande #A1B2.',
    );
    expect(customerCopy.preparing(params, 'fr')).toEqual({
      title: 'Commande en préparation',
      body: 'Épicerie Dakar prépare votre commande #A1B2.',
    });
    expect(customerCopy.preparing(params, 'en').title).toBe(
      'Order being prepared',
    );
    expect(customerCopy.ready(params, 'fr').title).toBe('Commande prête');
    // Ready says where the order is, not that a courier is coming: one may
    // not have accepted yet.
    expect(customerCopy.ready(params, 'en').body).toBe(
      'Your order #A1B2 is ready at Épicerie Dakar. It is waiting for its courier.',
    );
    expect(
      courierCopy.newOffer({ vendor: 'X', km: 2.345, earningsCad: 7 }, 'fr')
        .body,
    ).toContain('2,3 km');
  });
});

/**
 * Just enough of a PostgREST builder for `send`: records the filters applied
 * and resolves to the rows given, and records deletes.
 */
function fakeDb(rows: { token: string; locale: string; platform?: string }[]) {
  const deleted: string[][] = [];
  const filters: [string, unknown][] = [];
  const select = {
    in: (column: string, value: unknown) => (
      filters.push([column, value]),
      select
    ),
    eq: (column: string, value: unknown) => (
      filters.push([column, value]),
      select
    ),
    // A PostgREST builder *is* a thenable — that is what is being faked.
    // oxlint-disable-next-line unicorn/no-thenable
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: rows, error: null }),
  };
  const db = {
    from: () => ({
      select: () => select,
      delete: () => ({
        in: (_: string, tokens: string[]) => (
          deleted.push(tokens),
          Promise.resolve({ data: null, error: null })
        ),
      }),
    }),
  };
  return { db, deleted, filters };
}

const config = { get: () => undefined };

/** A Firebase client that records what it was asked to send, and answers as told. */
function fakeFcm(outcomes: Record<string, 'sent' | 'dead' | 'failed'> = {}, configured = true) {
  const sent: { token: string; platform: string; title: string; url: string; channel: string }[] = [];
  const fcm = {
    isConfigured: configured,
    send: vi.fn(async (device: { token: string; platform: string }, n: { title: string; url: string; channel: string }) => {
      sent.push({ token: device.token, platform: device.platform, title: n.title, url: n.url, channel: n.channel });
      return outcomes[device.token] ?? 'sent';
    }),
  };
  return { fcm: fcm as unknown as FcmClient, sent };
}

describe('PushService.send — through Firebase', () => {
  afterEach(() => vi.unstubAllGlobals());

  const message = {
    content: (l: 'fr' | 'en') => customerCopy.delivered({ ref: '#A1B2', vendor: 'V' }, l),
    url: '/(customer)/order/1',
    channel: 'orders' as const,
    category: 'orderUpdates' as const,
  };

  it('sends each phone its own language, on its own platform, and forgets a token Firebase no longer knows', async () => {
    const { db, deleted, filters } = fakeDb([
      { token: 'fcm-token-of-an-android-phone', locale: 'fr', platform: 'android' },
      { token: 'fcm-token-of-an-iphone', locale: 'en', platform: 'ios' },
      { token: 'fcm-token-of-an-uninstalled-app', locale: 'fr', platform: 'android' },
    ]);
    const expo = vi.fn();
    vi.stubGlobal('fetch', expo);
    const { fcm, sent } = fakeFcm({ 'fcm-token-of-an-uninstalled-app': 'dead' });

    await new PushService(db as never, config as never, fcm).send(['u1', 'u1'], message);

    expect(filters).toContainEqual(['user_id', ['u1']]);
    expect(filters).toContainEqual(['order_updates', true]);
    expect(sent).toEqual([
      { token: 'fcm-token-of-an-android-phone', platform: 'android', title: 'Commande livrée', url: '/(customer)/order/1', channel: 'orders' },
      { token: 'fcm-token-of-an-iphone', platform: 'ios', title: 'Order delivered', url: '/(customer)/order/1', channel: 'orders' },
      { token: 'fcm-token-of-an-uninstalled-app', platform: 'android', title: 'Commande livrée', url: '/(customer)/order/1', channel: 'orders' },
    ]);
    expect(deleted).toEqual([['fcm-token-of-an-uninstalled-app']]);
    // Nothing went near Expo: no phone here has one of its tokens.
    expect(expo).not.toHaveBeenCalled();
  });

  it('keeps a token whose send merely failed', async () => {
    const { db, deleted } = fakeDb([{ token: 'fcm-token-of-an-android-phone', locale: 'fr', platform: 'android' }]);
    const { fcm } = fakeFcm({ 'fcm-token-of-an-android-phone': 'failed' });

    await new PushService(db as never, config as never, fcm).send(['u1'], message);
    expect(deleted).toEqual([]);
  });

  it('sends a phone from an older build through Expo, and the others through Firebase', async () => {
    const { db } = fakeDb([
      { token: 'ExponentPushToken[old-build]', locale: 'fr', platform: 'ios' },
      { token: 'fcm-token-of-an-iphone', locale: 'fr', platform: 'ios' },
    ]);
    const expo = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }));
    vi.stubGlobal('fetch', expo);
    const { fcm, sent } = fakeFcm();

    await new PushService(db as never, config as never, fcm).send(['u1'], message);

    expect(sent.map((s) => s.token)).toEqual(['fcm-token-of-an-iphone']);
    const viaExpo = JSON.parse((expo.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(viaExpo.map((m: { to: string }) => m.to)).toEqual(['ExponentPushToken[old-build]']);
  });

  it('sends nothing through Firebase, and does not throw, while the service account is missing', async () => {
    const { db, deleted } = fakeDb([{ token: 'fcm-token-of-an-android-phone', locale: 'fr', platform: 'android' }]);
    const { fcm } = fakeFcm({}, false);

    await expect(new PushService(db as never, config as never, fcm).send(['u1'], message)).resolves.toBeUndefined();
    expect(fcm.send).not.toHaveBeenCalled();
    // Not being able to send is no reason to forget a phone.
    expect(deleted).toEqual([]);
  });
});

describe('the message Firebase is asked to deliver', () => {
  const notification = { title: 'Commande livrée', body: 'Votre commande #A1B2 est arrivée.', url: '/(customer)/order/1', channel: 'orders' };

  it('is a data message on Android, in the shape the app builds a notification from', () => {
    expect(fcmMessage({ token: 'a-token', platform: 'android' }, notification)).toEqual({
      token: 'a-token',
      data: {
        title: 'Commande livrée',
        message: 'Votre commande #A1B2 est arrivée.',
        channelId: 'orders',
        // A JSON string: it becomes the notification's data, where the app reads `url`.
        body: '{"url":"/(customer)/order/1"}',
      },
      android: { priority: 'high' },
    });
  });

  it('is a notification on iOS, with the data where the app looks for it', () => {
    const message = fcmMessage({ token: 'a-token', platform: 'ios' }, notification) as {
      notification: unknown;
      data?: unknown;
      apns: { headers: Record<string, string>; payload: { aps: unknown; body: unknown } };
    };
    expect(message.notification).toEqual({ title: 'Commande livrée', body: 'Votre commande #A1B2 est arrivée.' });
    expect(message.apns.payload).toEqual({ aps: { sound: 'default' }, body: { url: '/(customer)/order/1' } });
    expect(message.apns.headers).toEqual({ 'apns-push-type': 'alert', 'apns-priority': '10' });
    expect(message.data).toBeUndefined();
  });
});

describe('the Firebase service account', () => {
  const file = JSON.stringify({ type: 'service_account', project_id: 'sougouba-test', client_email: 'push@sougouba-test.iam.gserviceaccount.com', private_key: 'KEY' });

  it('is read as the file Firebase downloads, or the same in base64', () => {
    const expected = { projectId: 'sougouba-test', clientEmail: 'push@sougouba-test.iam.gserviceaccount.com', privateKey: 'KEY' };
    expect(parseServiceAccount(file)).toEqual(expected);
    expect(parseServiceAccount(Buffer.from(file).toString('base64'))).toEqual(expected);
  });

  it('is absent rather than fatal when missing or unreadable', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('   ')).toBeNull();
    expect(parseServiceAccount('not a service account')).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: 'only-this' }))).toBeNull();
    expect(new FcmClient({ get: () => undefined } as never).isConfigured).toBe(false);
  });
});

describe('FcmClient.send', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A client already signed in, so a test only sees the send itself. */
  function signedIn() {
    const client = new FcmClient({ get: () => file } as never);
    (client as unknown as { access: unknown }).access = { token: 'an-access-token', expiresAt: Date.now() + 3_600_000 };
    return client;
  }
  const file = JSON.stringify({ project_id: 'sougouba-test', client_email: 'push@sougouba-test.iam.gserviceaccount.com', private_key: 'KEY' });
  const device = { token: 'a-token', platform: 'android' as const };
  const notification = { title: 't', body: 'b', url: '/', channel: 'orders' };
  const refusal = (status: number, error: unknown) => ({ ok: false, status, json: async () => ({ error }) });

  it('posts to the project, signed with the access token', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ name: 'projects/sougouba-test/messages/1' }) }));
    vi.stubGlobal('fetch', fetch);

    await expect(signedIn().send(device, notification)).resolves.toBe('sent');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/sougouba-test/messages:send');
    expect(init.headers.Authorization).toBe('Bearer an-access-token');
    expect(JSON.parse(init.body).message.token).toBe('a-token');
  });

  it('reports a token Firebase no longer knows as dead', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => refusal(404, { status: 'NOT_FOUND', message: 'Requested entity was not found.', details: [{ errorCode: 'UNREGISTERED' }] })));
    await expect(signedIn().send(device, notification)).resolves.toBe('dead');
  });

  it('reports a token Firebase calls invalid as dead — but not a message it calls invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => refusal(400, { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token', details: [{ errorCode: 'INVALID_ARGUMENT' }] })));
    await expect(signedIn().send(device, notification)).resolves.toBe('dead');

    // Our mistake, not the phone's: the token must survive it.
    vi.stubGlobal('fetch', vi.fn(async () => refusal(400, { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received. Unknown name "foo"', details: [{ errorCode: 'INVALID_ARGUMENT' }] })));
    await expect(signedIn().send(device, notification)).resolves.toBe('failed');
  });

  it('never throws: an outage is a failed send', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ECONNRESET'))));
    await expect(signedIn().send(device, notification)).resolves.toBe('failed');
  });

  it('signs in again after Google rejects the access token', async () => {
    const client = signedIn();
    vi.stubGlobal('fetch', vi.fn(async () => refusal(401, { status: 'UNAUTHENTICATED', message: 'expired' })));
    await expect(client.send(device, notification)).resolves.toBe('failed');
    expect((client as unknown as { access: unknown }).access).toBeNull();
  });
});

describe('PushService.send — through Expo, for builds that predate Firebase', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders per device language, honours the switch, and forgets tokens Expo says are gone', async () => {
    const { db, deleted, filters } = fakeDb([
      { token: 'ExponentPushToken[fr]', locale: 'fr' },
      { token: 'ExponentPushToken[en]', locale: 'en' },
    ]);
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetch);

    await new PushService(db as never, config as never, fakeFcm().fcm).send(['u1', 'u1'], {
      content: (l) => customerCopy.delivered({ ref: '#A1B2', vendor: 'V' }, l),
      url: '/(customer)/order/1',
      channel: 'orders',
      category: 'orderUpdates',
    });

    expect(filters).toContainEqual(['user_id', ['u1']]);
    expect(filters).toContainEqual(['order_updates', true]);

    const sent = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(sent.map((m: { title: string }) => m.title)).toEqual([
      'Commande livrée',
      'Order delivered',
    ]);
    expect(sent[0].data).toEqual({ url: '/(customer)/order/1' });

    expect(deleted).toEqual([['ExponentPushToken[en]']]);
  });

  it('never throws, even when Expo is down', async () => {
    const { db } = fakeDb([{ token: 'ExponentPushToken[a]', locale: 'fr' }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('ECONNRESET'))),
    );
    await expect(
      new PushService(db as never, config as never, fakeFcm().fcm).send(['u1'], {
        content: () => ({ title: 't', body: 'b' }),
        url: '/',
        channel: 'offers',
      }),
    ).resolves.toBeUndefined();
  });

  it('skips the database entirely when nobody is addressed', async () => {
    const from = vi.fn();
    await new PushService({ from } as never, config as never, fakeFcm().fcm).send([], {
      content: () => ({ title: 't', body: 'b' }),
      url: '/',
      channel: 'orders',
    });
    expect(from).not.toHaveBeenCalled();
  });
});
