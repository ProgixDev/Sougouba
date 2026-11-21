import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import { AVATARS_BUCKET, MeService } from './me.service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/** `getMe`'s read, the update it then writes (captured), and one signed upload. */
function fakeDb() {
  const writes: Record<string, unknown>[] = [];
  const profile = { id: USER, full_name: 'Abdou', avatar_url: null, role: 'customer' };
  const from = () => {
    const query = {
      select: () => query,
      eq: () => query,
      update: (values: Record<string, unknown>) => {
        writes.push(values);
        return query;
      },
      maybeSingle: () => Promise.resolve({ data: profile, error: null }),
      single: () => Promise.resolve({ data: { ...profile, ...writes.at(-1) }, error: null }),
    };
    return query;
  };
  const createSignedUploadUrl = vi.fn((path: string) =>
    Promise.resolve({ data: { signedUrl: `https://storage.test/upload/${path}`, path, token: 't' }, error: null })
  );
  const storageFrom = vi.fn(() => ({ createSignedUploadUrl }));
  const db = { from, storage: { from: storageFrom } } as unknown as Db;
  return { db, writes, storageFrom };
}

describe('profile photo', () => {
  it("signs an upload in the account's own avatars folder", async () => {
    const { db, storageFrom } = fakeDb();
    const upload = await new MeService(db).createAvatarUpload(USER, { contentType: 'image/jpeg' });
    expect(storageFrom).toHaveBeenCalledWith(AVATARS_BUCKET);
    expect(upload.path).toMatch(new RegExp(`^avatars/${USER}/[0-9a-f-]{36}\\.jpg$`));
  });

  it('saves a path in the own folder', async () => {
    const { db, writes } = fakeDb();
    await new MeService(db).updateMe(USER, { avatarUrl: `avatars/${USER}/me.jpg` });
    expect(writes[0]).toMatchObject({ avatar_url: `avatars/${USER}/me.jpg` });
  });

  it("refuses someone else's photo, another bucket, or a full URL", async () => {
    for (const avatarUrl of [
      `avatars/${OTHER}/them.jpg`,
      `product-media/${USER}/x.jpg`,
      'https://example.com/me.jpg',
      `avatars/${USER}/../${OTHER}/x.jpg`,
    ]) {
      const { db, writes } = fakeDb();
      await expect(new MeService(db).updateMe(USER, { avatarUrl })).rejects.toBeInstanceOf(BadRequestException);
      expect(writes).toHaveLength(0);
    }
  });

  it('removes the photo when sent an empty string', async () => {
    const { db, writes } = fakeDb();
    await new MeService(db).updateMe(USER, { avatarUrl: '' });
    expect(writes[0]).toMatchObject({ avatar_url: null });
  });

  it('leaves the photo alone when only the name changes', async () => {
    const { db, writes } = fakeDb();
    await new MeService(db).updateMe(USER, { fullName: 'Abderraouf' });
    expect(writes[0]).not.toHaveProperty('avatar_url');
  });
});
