import { describe, expect, it } from 'vitest';

import { mergeAvatars } from './approvals.service.js';

describe('the photos on the users list', () => {
  const items = [
    { id: 'u1', fullName: 'Awa Diallo', email: 'awa@example.ca' },
    { id: 'u2', fullName: 'Moussa Keita', email: null },
    { id: 'u3', fullName: 'Fatou Sow', email: 'fatou@example.ca' },
  ];

  it('puts each account’s photo on its own row, in the list’s order', () => {
    // Rows come back from the database in any order.
    const merged = mergeAvatars(items, [
      { id: 'u3', avatar_url: 'avatars/u3/me.jpg' },
      { id: 'u1', avatar_url: 'avatars/u1/me.jpg' },
    ]);

    expect(merged).toEqual([
      { id: 'u1', fullName: 'Awa Diallo', email: 'awa@example.ca', avatarUrl: 'avatars/u1/me.jpg' },
      { id: 'u2', fullName: 'Moussa Keita', email: null, avatarUrl: null },
      { id: 'u3', fullName: 'Fatou Sow', email: 'fatou@example.ca', avatarUrl: 'avatars/u3/me.jpg' },
    ]);
  });

  it('says there is no photo for an account that has not set one', () => {
    expect(mergeAvatars(items, [{ id: 'u1', avatar_url: null }]).map((row) => (row as { avatarUrl: unknown }).avatarUrl)).toEqual([null, null, null]);
  });
});
