/**
 * The one guarantee the admin port could quietly lose.
 *
 * `AuditService.record` used to take the caller's transaction and run inside
 * it: an audit entry for a change that rolled back is a lie, and a change that
 * committed without its entry is the gap the table exists to close. There is no
 * transaction to hand across PostgREST, so every audited action moved into a
 * `plpgsql` function that does both. This proves it actually did.
 *
 *   node --env-file=.env scripts/verify-admin-audit.mjs
 *
 * ⚠️ `admin_audit_log` is append-only — a trigger refuses UPDATE and DELETE for
 * every role, owner included. So the failure cases below are the ones run
 * against live data (they write nothing by definition), and the success case
 * is run last and leaves exactly one row behind, marked as a verification.
 * That row cannot be removed afterwards, by design and on purpose.
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

const auditCount = async () => {
  const { count } = await db.from('admin_audit_log').select('id', { count: 'exact', head: true });
  return count;
};

const admin = (await db.from('profiles').select('id, full_name').eq('role', 'admin').limit(1).single()).data;
if (!admin) throw new Error('no admin profile to act as');

// ── 1. a refusal writes nothing ────────────────────────────────────────────
// The important half. If the audit insert were a separate request, a failed
// action could still leave an entry claiming it happened.
console.log('\na refused action leaves no audit entry');
{
  const before = await auditCount();
  const missing = '00000000-0000-0000-0000-000000000000';

  const { error: e1 } = await db.rpc('admin_resolve_dispute', {
    p_admin_id: admin.id, p_order_id: missing, p_outcome: 'resolved',
    p_note: 'verification — must not commit', p_changes: {},
  });
  check('resolve_dispute on a missing dispute is refused', !!e1);
  check('  …with SGB05', e1?.code === 'SGB05', e1?.code);

  const { error: e2 } = await db.rpc('admin_resolve_courier_issue', {
    p_admin_id: admin.id, p_order_id: missing, p_note: 'verification — must not commit',
  });
  check('resolve_courier_issue on a missing issue is refused', !!e2);
  check('  …with SGB05', e2?.code === 'SGB05', e2?.code);

  const after = await auditCount();
  check('no audit entry was written by either refusal', after === before, `${before} → ${after}`);
}

// ── 2. the log refuses to be rewritten ─────────────────────────────────────
console.log('\nthe log is append-only, even to the service role');
{
  const row = (await db.from('admin_audit_log').select('id').limit(1).maybeSingle()).data;
  if (row) {
    const { error: u } = await db.from('admin_audit_log').update({ reason: 'tampered' }).eq('id', row.id);
    check('UPDATE refused', !!u, 'an audit row was rewritten');
    const { error: d } = await db.from('admin_audit_log').delete().eq('id', row.id);
    check('DELETE refused', !!d, 'an audit row was deleted');
  } else {
    console.log('  – skipped, log is empty');
  }
}

// ── 3. a success writes the change and its entry together ──────────────────
console.log('\na successful action writes both, in one transaction');
{
  const dispute = (
    await db.from('disputes').select('order_id, status, merchant_reply').in('status', ['open', 'answered']).limit(1).maybeSingle()
  ).data;

  if (!dispute) {
    console.log('  – skipped, no open dispute to settle');
  } else {
    const before = await auditCount();
    const note = 'verification run — see scripts/verify-admin-audit.mjs';

    const { data, error } = await db.rpc('admin_resolve_dispute', {
      p_admin_id: admin.id, p_order_id: dispute.order_id, p_outcome: 'resolved',
      p_note: note, p_changes: { status: { from: dispute.status, to: 'resolved' } },
    });
    check('accepted', !error, error?.message);
    check('the dispute is resolved', data?.status === 'resolved', data?.status);

    const after = await auditCount();
    check('exactly one audit entry was added', after === before + 1, `${before} → ${after}`);

    const entry = (
      await db.from('admin_audit_log').select('*').eq('subject_id', dispute.order_id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
    ).data;
    check('entry names the action', entry?.action === 'dispute.resolve', entry?.action);
    check('entry names the actor, snapshotted not joined', entry?.actor_name === admin.full_name, entry?.actor_name);
    check('entry carries the reason', entry?.reason === note);
    check('entry carries the diff', entry?.changes?.status?.to === 'resolved', JSON.stringify(entry?.changes));

    // Put the dispute back. The audit row stays — that is the point of it.
    await db.from('disputes')
      .update({ status: dispute.status, merchant_reply: dispute.merchant_reply, resolved_by: null, resolved_at: null })
      .eq('order_id', dispute.order_id);
    console.log(`  ℹ dispute restored to "${dispute.status}"; its audit entry remains, as designed`);
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
