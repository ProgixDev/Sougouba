import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { SupportAdminService } from '../admin/support-admin.service.js';
import type { Db } from '../db/client.js';
import { SupportService } from './support.service.js';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const CONV = '33333333-3333-4333-8333-333333333333';

/**
 * A chainable stand-in for PostgREST that records every write and answers the
 * "open conversation" read with whatever the test says is open.
 */
function fakeDb(open: { id: string; status: 'open' | 'escalated' } | null) {
  const writes: { table: string; kind: string; values: unknown }[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit']) q[m] = () => q;
    q.insert = (values: unknown) => {
      writes.push({ table, kind: 'insert', values });
      return q;
    };
    q.update = (values: unknown) => {
      writes.push({ table, kind: 'update', values });
      return q;
    };
    q.maybeSingle = () => Promise.resolve({ data: open, error: null });
    q.single = () => Promise.resolve({ data: { id: CONV, status: 'escalated' }, error: null });
    // A query builder is awaited directly, as PostgREST's is — the fake has to be thenable.
    // oxlint-disable-next-line unicorn/no-thenable
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return q;
  };
  return { db: { from } as unknown as Db, writes };
}

const noAi = { configured: false, reply: vi.fn() } as never;

describe('handing a conversation to the team', () => {
  it('escalates the open conversation, keeping its history', async () => {
    const { db, writes } = fakeDb({ id: CONV, status: 'open' });
    const view = await new SupportService(db, noAi, undefined as never).escalate(CUSTOMER);
    expect(view.status).toBe('escalated');
    expect(writes).toEqual([
      expect.objectContaining({ table: 'support_conversations', kind: 'update', values: expect.objectContaining({ status: 'escalated' }) }),
    ]);
  });

  it('opens a conversation already escalated when there is none — even with no assistant configured', async () => {
    const { db, writes } = fakeDb(null);
    const view = await new SupportService(db, noAi, undefined as never).escalate(CUSTOMER);
    expect(view).toMatchObject({ status: 'escalated', conversationId: CONV, available: false });
    expect(writes[0]).toMatchObject({ kind: 'insert', values: expect.objectContaining({ status: 'escalated' }) });
  });

  it('is a no-op when already escalated', async () => {
    const { db, writes } = fakeDb({ id: CONV, status: 'escalated' });
    await new SupportService(db, noAi, undefined as never).escalate(CUSTOMER);
    expect(writes).toHaveLength(0);
  });

  it('stores what the customer writes after escalation for a person, without asking the model', async () => {
    const reply = vi.fn();
    const { db, writes } = fakeDb({ id: CONV, status: 'escalated' });
    await new SupportService(db, { configured: true, reply } as never, undefined as never).send(CUSTOMER, 'Allô ?');
    expect(reply).not.toHaveBeenCalled();
    expect(writes[0]).toMatchObject({
      table: 'support_messages',
      kind: 'insert',
      values: expect.objectContaining({ role: 'user', content: 'Allô ?' }),
    });
  });
});

describe('the back-office inbox', () => {
  function admin(rpcError: { code: string; message: string } | null) {
    const rpc = vi.fn(() => Promise.resolve({ data: rpcError ? null : 'msg', error: rpcError }));
    const supportReplied = vi.fn(() => Promise.resolve());
    const service = new SupportAdminService({ rpc } as unknown as Db, { supportReplied } as never);
    vi.spyOn(service, 'detail').mockResolvedValue({ customer: { id: CUSTOMER } } as never);
    return { service, rpc, supportReplied };
  }

  it('replies through the audited function, then pushes the customer', async () => {
    const { service, rpc, supportReplied } = admin(null);
    await service.reply(ADMIN, CONV, 'Bonjour, nous regardons.');
    expect(rpc).toHaveBeenCalledWith('admin_support_reply', {
      p_admin_id: ADMIN,
      p_conversation_id: CONV,
      p_content: 'Bonjour, nous regardons.',
    });
    expect(supportReplied).toHaveBeenCalledWith(CUSTOMER);
  });

  it('refuses a conversation not waiting for the team, and an unknown one, without pushing', async () => {
    const notWaiting = admin({ code: 'SGB06', message: 'x' });
    await expect(notWaiting.service.reply(ADMIN, CONV, 'x')).rejects.toBeInstanceOf(BadRequestException);
    expect(notWaiting.supportReplied).not.toHaveBeenCalled();

    const missing = admin({ code: 'SGB05', message: 'x' });
    await expect(missing.service.resolve(ADMIN, CONV)).rejects.toBeInstanceOf(NotFoundException);
  });
});
