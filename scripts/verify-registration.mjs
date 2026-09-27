/**
 * Merchant registration with documents, walked against the live project
 * through the running API (client's list, 2026-09-27; migration `0030`).
 *
 * What a type-check cannot tell you, and this does:
 *   - a signed upload URL actually accepts a file, and the bucket's own limits hold;
 *   - a merchant cannot write to, read or list the private bucket directly;
 *   - `vendor_apply` refuses a path with nothing behind it, or someone else's path;
 *   - a complete application lands with every new field, and the stored documents
 *     can be signed and read back the way the admin detail does it.
 *
 * Needs the API running (`npm run start:dev`) and, besides this repo's .env, the
 * anon key the mobile app uses:
 *
 *   SUPABASE_ANON_KEY=… API_URL=http://127.0.0.1:3000 npm run verify:registration
 *
 * Creates one throwaway auth user and deletes it — and only it — at the end,
 * whatever happened in between.
 */
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
if (!SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY must be set — the mobile app’s EXPO_PUBLIC_SUPABASE_ANON_KEY.');

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BUCKET = 'merchant-documents';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

// A minimal but real PDF, so the bucket's MIME rule sees what a bank letter is.
const PDF = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
);

const email = `verify-registration-${Date.now()}@example.test`;
const password = `Vr-${crypto.randomUUID()}`;
let userId = null;

async function call(path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function uploadDoc(token, kind, bytes = PDF, contentType = 'application/pdf') {
  const issued = await call('/vendors/apply/documents', token, { kind, contentType: 'application/pdf' });
  if (issued.status !== 201) throw new Error(`upload URL refused: ${issued.status} ${JSON.stringify(issued.body)}`);
  const put = await fetch(issued.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes });
  return { ...issued.body, putStatus: put.status };
}

const application = (docs) => ({
  name: `Vérification ${Date.now()}`,
  vendorType: 'grocery',
  specialtyFr: 'Épicerie de test',
  isHalalCertified: false,
  street: '1234 Rue Saint-Denis',
  city: 'Montréal',
  postalCode: 'H2X 3J8',
  deliveryEtaMin: 30,
  legalName: '9999-0000 Québec inc.',
  neq: '1234567890',
  gstNumber: '123456789 RT0001',
  qstNumber: '1234567890 TQ0001',
  contactName: 'Test Dirigeant',
  contactPhone: '514 555-0199',
  mapaqNumber: 'MAP-0001',
  mapaqExpiresOn: '2099-12-31',
  payoutMethod: 'bank_document',
  ...docs,
});

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const token = signedIn.data.session.access_token;

  console.log('\nupload URLs');
  const id = await uploadDoc(token, 'id');
  check('the API picks a path in the owner’s own folder', id.path.startsWith(`applications/${userId}/id-`), id.path);
  check('the file lands through the signed URL', id.putStatus === 200, `HTTP ${id.putStatus}`);
  const badType = await call('/vendors/apply/documents', token, { kind: 'id', contentType: 'text/html' });
  check('a type outside the list is refused before any URL exists', badType.status === 400, `HTTP ${badType.status}`);

  console.log('\nthe bucket, from the merchant’s own session');
  const direct = await client.storage.from(BUCKET).upload(`applications/${userId}/planted.pdf`, PDF, { contentType: 'application/pdf' });
  check('a direct upload is refused', Boolean(direct.error), 'it succeeded');
  const overwrite = await client.storage.from(BUCKET).update(id.path, PDF, { contentType: 'application/pdf' });
  check('overwriting a submitted document is refused', Boolean(overwrite.error), 'it succeeded');
  const read = await client.storage.from(BUCKET).download(id.path);
  check('reading it back directly is refused', Boolean(read.error), 'it succeeded');
  const listed = await client.storage.from(BUCKET).list(`applications/${userId}`);
  check('listing the folder shows nothing', (listed.data ?? []).length === 0, `${listed.data?.length} objects`);

  console.log('\nvendor_apply’s own check');
  const mapaq = await uploadDoc(token, 'mapaq');
  const bank = await uploadDoc(token, 'bank');
  const missing = await call('/vendors/apply', token, application({
    idDocumentPath: `applications/${userId}/id-never-uploaded.pdf`,
    mapaqDocumentPath: mapaq.path,
    bankDocumentPath: bank.path,
  }));
  check('a path with nothing behind it is refused', missing.status === 400, `HTTP ${missing.status} ${JSON.stringify(missing.body?.message)}`);
  const foreign = await call('/vendors/apply', token, application({
    idDocumentPath: `applications/00000000-0000-4000-8000-000000000000/id.pdf`,
    mapaqDocumentPath: mapaq.path,
    bankDocumentPath: bank.path,
  }));
  check('another owner’s folder is refused', foreign.status === 400, `HTTP ${foreign.status}`);
  const noBank = await call('/vendors/apply', token, application({ idDocumentPath: id.path, mapaqDocumentPath: mapaq.path }));
  check('bank_document without the document is refused', noBank.status === 400, `HTTP ${noBank.status}`);
  const expired = await call('/vendors/apply', token, application({
    idDocumentPath: id.path, mapaqDocumentPath: mapaq.path, bankDocumentPath: bank.path, mapaqExpiresOn: '2020-01-01',
  }));
  check('an expired permit is refused', expired.status === 400, `HTTP ${expired.status}`);
  const { count: shopsAfterRefusals } = await admin.from('vendors').select('id', { count: 'exact', head: true }).eq('owner_id', userId);
  check('no refusal left a shop behind', shopsAfterRefusals === 0, `${shopsAfterRefusals} shops`);

  console.log('\na complete application');
  const ok = await call('/vendors/apply', token, application({
    idDocumentPath: id.path, mapaqDocumentPath: mapaq.path, bankDocumentPath: bank.path,
  }));
  check('it is accepted, pending', ok.status === 201 && ok.body?.status === 'pending', `HTTP ${ok.status} ${JSON.stringify(ok.body?.message ?? ok.body?.status)}`);

  const { data: reg } = await admin.from('vendor_registrations').select('*').eq('vendor_id', ok.body?.id).maybeSingle();
  check('every new field is stored',
    reg?.legal_name === '9999-0000 Québec inc.' && reg?.gst_number === '123456789RT0001' &&
    reg?.qst_number === '1234567890TQ0001' && reg?.mapaq_expires_on === '2099-12-31' &&
    reg?.payout_method === 'bank_document',
    JSON.stringify(reg));
  check('every document path is stored',
    reg?.id_document_path === id.path && reg?.mapaq_document_path === mapaq.path && reg?.bank_document_path === bank.path);

  const signed = await admin.storage.from(BUCKET).createSignedUrls([id.path, bank.path], 600);
  const fetched = await Promise.all((signed.data ?? []).map((s) => fetch(s.signedUrl).then((r) => r.status)));
  check('the admin’s signed URLs open the files', fetched.length === 2 && fetched.every((s) => s === 200), fetched.join(', '));

  const late = await call('/vendors/apply/documents', token, { kind: 'id', contentType: 'application/pdf' });
  check('no more upload URLs once the shop exists', late.status === 409, `HTTP ${late.status}`);
} catch (error) {
  failed++;
  console.log(`  ✗ aborted — ${error.message}`);
} finally {
  // Scoped to the one user this run created, checked before anything is
  // deleted rather than after (see PROGRESS.md, "a self-inflicted data loss").
  if (userId) {
    const { data: shop } = await admin.from('vendors').select('id, owner_id').eq('owner_id', userId).maybeSingle();
    if (shop && shop.owner_id === userId) await admin.from('vendors').delete().eq('id', shop.id);
    const { data: files } = await admin.storage.from(BUCKET).list(`applications/${userId}`);
    if (files?.length) {
      await admin.storage.from(BUCKET).remove(files.map((f) => `applications/${userId}/${f.name}`));
    }
    await admin.auth.admin.deleteUser(userId);
    console.log(`\n  (cleaned up ${email})`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
