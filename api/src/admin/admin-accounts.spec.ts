import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { createAdminSchema } from './dto/admin.dto.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const NEW_ID = '22222222-2222-4222-8222-222222222222';

function setup({
  createError = null as { code: string; message: string } | null,
  rpcError = null as { code: string; message: string } | null,
} = {}) {
  const createUser = vi.fn(() =>
    Promise.resolve(createError ? { data: { user: null }, error: createError } : { data: { user: { id: NEW_ID } }, error: null })
  );
  const deleteUser = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  const updateUserById = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  const rpc = vi.fn((name: string) =>
    Promise.resolve(
      name === 'admin_auth_users'
        ? { data: [{ id: NEW_ID, email: 'ops@sougouba.ca', last_sign_in_at: null }], error: null }
        : { data: null, error: rpcError }
    )
  );
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) query[m] = () => query;
  // A query builder is awaited directly, as PostgREST's is — the fake has to be thenable.
  // oxlint-disable-next-line unicorn/no-thenable
  query.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [{ id: NEW_ID, fullName: 'Ops', memberSince: null }], error: null });
  const db = { from: () => query, rpc, auth: { admin: { createUser, deleteUser, updateUserById } } } as unknown as Db;
  return { service: new AdminAccountsService(db), createUser, deleteUser, updateUserById, rpc };
}

describe('adding an administrator', () => {
  it('creates a fresh account with a one-time password and grants the role', async () => {
    const { service, createUser, rpc } = setup();
    const { admin, temporaryPassword } = await service.create(ACTOR, { email: 'ops@sougouba.ca', fullName: 'Ops' });
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(16);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ops@sougouba.ca', password: temporaryPassword, email_confirm: true })
    );
    expect(rpc).toHaveBeenCalledWith('admin_grant_admin', { p_actor_id: ACTOR, p_user_id: NEW_ID, p_full_name: 'Ops' });
    expect(admin).toMatchObject({ id: NEW_ID, email: 'ops@sougouba.ca' });
  });

  it('refuses an email that already has an account, rather than turning it into an admin', async () => {
    const { service, rpc } = setup({ createError: { code: 'email_exists', message: 'exists' } });
    await expect(service.create(ACTOR, { email: 'client@x.ca', fullName: 'X' })).rejects.toBeInstanceOf(ConflictException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('deletes the new account when the role cannot be granted', async () => {
    const { service, deleteUser } = setup({ rpcError: { code: 'SGB06', message: 'has role' } });
    await expect(service.create(ACTOR, { email: 'ops@sougouba.ca', fullName: 'Ops' })).rejects.toThrow();
    expect(deleteUser).toHaveBeenCalledWith(NEW_ID);
  });

  it('normalises the email it is given', () => {
    expect(createAdminSchema.parse({ email: ' Ops@Sougouba.CA ', fullName: 'Ops' }).email).toBe('ops@sougouba.ca');
  });
});

describe('removing an administrator', () => {
  it('removes the role, then bans the login', async () => {
    const { service, rpc, updateUserById } = setup();
    await service.revoke(ACTOR, NEW_ID, 'A quitté l’équipe');
    expect(rpc).toHaveBeenCalledWith('admin_revoke_admin', { p_actor_id: ACTOR, p_user_id: NEW_ID, p_reason: 'A quitté l’équipe' });
    expect(updateUserById).toHaveBeenCalledWith(NEW_ID, { ban_duration: '876000h' });
  });

  it('refuses yourself or the last administrator, and bans nobody', async () => {
    const { service, updateUserById } = setup({ rpcError: { code: 'SGB06', message: 'refused' } });
    await expect(service.revoke(ACTOR, ACTOR, undefined)).rejects.toThrow('propre accès');
    await expect(service.revoke(ACTOR, NEW_ID, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
