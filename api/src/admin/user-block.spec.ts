import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { isBanned } from '../auth/banned.js';
import type { Db } from '../db/client.js';
import { ApprovalsService } from './approvals.service.js';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

/**
 * The profile read, the Auth ban and the audit RPC. `userDetail` (the reply)
 * is stubbed on the service: its six reads are not what these tests are about.
 */
function setup({
  profile = { fullName: 'Client Test', role: 'customer' } as { fullName: string | null; role: string } | null,
  auditError = null as { code: string; message: string } | null,
} = {}) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => Promise.resolve({ data: profile, error: null }),
  };
  const updateUserById = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: auditError }));
  const db = { from: () => query, rpc, auth: { admin: { updateUserById } } } as unknown as Db;
  const service = new ApprovalsService(db, undefined as never);
  vi.spyOn(service, 'userDetail').mockResolvedValue({ id: USER } as never);
  return { service, updateUserById, rpc };
}

describe('blocking an account', () => {
  it('bans through Auth, then writes the audit line', async () => {
    const { service, updateUserById, rpc } = setup();
    await service.setUserBlocked(ADMIN, USER, true, 'Fraude à la carte');
    expect(updateUserById).toHaveBeenCalledWith(USER, { ban_duration: '876000h' });
    expect(rpc).toHaveBeenCalledWith('admin_record_user_block', {
      p_admin_id: ADMIN,
      p_user_id: USER,
      p_blocked: true,
      p_reason: 'Fraude à la carte',
      p_label: 'Client Test',
    });
  });

  it('lifts the ban on unblock', async () => {
    const { service, updateUserById } = setup();
    await service.setUserBlocked(ADMIN, USER, false, undefined);
    expect(updateUserById).toHaveBeenCalledWith(USER, { ban_duration: 'none' });
  });

  it('puts the ban back as it was when the audit write fails', async () => {
    const { service, updateUserById } = setup({ auditError: { code: '57014', message: 'timeout' } });
    await expect(service.setUserBlocked(ADMIN, USER, true, 'Fraude')).rejects.toThrow();
    expect(updateUserById.mock.calls).toEqual([
      [USER, { ban_duration: '876000h' }],
      [USER, { ban_duration: 'none' }],
    ]);
  });

  it('refuses to block an administrator, or yourself', async () => {
    const admin = setup({ profile: { fullName: 'Autre admin', role: 'admin' } });
    await expect(admin.service.setUserBlocked(ADMIN, USER, true, 'x')).rejects.toBeInstanceOf(BadRequestException);
    expect(admin.updateUserById).not.toHaveBeenCalled();

    const self = setup();
    await expect(self.service.setUserBlocked(ADMIN, ADMIN, true, 'x')).rejects.toBeInstanceOf(BadRequestException);
    expect(self.updateUserById).not.toHaveBeenCalled();
  });

  it('answers 404 for an account that does not exist', async () => {
    const { service, updateUserById } = setup({ profile: null });
    await expect(service.setUserBlocked(ADMIN, USER, true, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});

describe('isBanned', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  it('is true only for a ban that has not run out', () => {
    expect(isBanned('2126-01-01T00:00:00Z', now)).toBe(true);
    expect(isBanned('2026-11-21T11:59:59Z', now)).toBe(false);
    expect(isBanned(null, now)).toBe(false);
    expect(isBanned(undefined, now)).toBe(false);
  });
});
