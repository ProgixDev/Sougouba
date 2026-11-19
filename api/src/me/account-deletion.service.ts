import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { MERCHANT_DOCUMENTS_BUCKET } from '../catalog/media-paths.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapVoid } from '../db/unwrap.js';

/** What a scrubbed `NOT NULL` name column reads as afterwards — in the admin, and in a shop's old orders. */
const DELETED_NAME = 'Compte supprimé';
const DELETED_REASON = 'Compte supprimé par son titulaire';
/** PostgREST's `not.in` list for "this order is still moving". */
const FINISHED_ORDERS = '(delivered,cancelled)';
const AVATARS_BUCKET = 'avatars';

/**
 * Deleting an account, at the account holder's own request.
 *
 * ── Why this erases rather than deletes ─────────────────────────────────────
 *
 * The `profiles` row cannot go: `orders.customer_id`, `vendors.owner_id` and
 * `couriers.user_id` all reference it without a cascade, on purpose — an order
 * is a tax record and the other party's history, and it does not stop having
 * happened because one side left. So the row stays as an anonymous key and
 * everything that says *who* it was is removed around it:
 *
 * - **Deleted outright:** addresses, favourites, push tokens, pending email
 *   codes, support conversations, a courier's insurance and location pings,
 *   the avatar and the registration documents in Storage.
 * - **Blanked in place:** the profile, the courier file, the merchant's
 *   registration contact, and the name snapshot on past orders.
 * - **Kept:** orders, loyalty and coupon ledgers, payout records, the shop and
 *   its catalogue (order lines reference its products). The shop and the
 *   courier file are set to `suspended`, which takes them out of the catalogue
 *   and out of dispatch.
 *
 * The Supabase Auth user is then **soft-deleted** — a hard delete would cascade
 * into `profiles` and be refused by the same foreign keys. Soft deletion drops
 * the identities and replaces the email with a hash, so the address is free to
 * sign up again as a new, unrelated account.
 *
 * ── Why there is no transaction ─────────────────────────────────────────────
 *
 * This is a sequence of PostgREST calls rather than one `plpgsql` function,
 * unlike the rest of this API's multi-step writes. Every step is an idempotent
 * delete or overwrite, and the Auth deletion — the one step that cannot be
 * repeated, because afterwards there is no token to repeat it with — comes
 * last. A failure midway leaves an account that is partly blanked and still
 * signed in, and the same request finishes the job.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async deleteAccount(userId: string, accessToken: string | null): Promise<void> {
    const profile = await unwrap<{ role: string | null } | null>(
      this.db.from('profiles').select('role').eq('id', userId).maybeSingle()
    );
    if (!profile) throw new NotFoundException('No profile for this account');
    // An administrator leaving is an offboarding decision, not a button in a
    // phone app — and the last one deleting themselves would lock the back office.
    if (profile.role === 'admin') {
      throw new ForbiddenException('Un compte administrateur ne peut pas être supprimé depuis l’application.');
    }

    // Looked up by ownership rather than through `profiles.vendor_id` /
    // `courier_id`, so a half-finished application is found too.
    const vendor = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    const courier = await unwrap<{ id: string } | null>(
      this.db.from('couriers').select('id').eq('user_id', userId).maybeSingle()
    );

    await this.assertNothingInProgress(userId, vendor?.id ?? null, courier?.id ?? null);

    // Read now: once the Auth user is soft-deleted the address is a hash.
    const { data: authUser } = await this.db.auth.admin.getUserById(userId);
    const email = authUser.user?.email ?? null;

    await this.eraseCustomerData(userId, email);
    if (courier) await this.eraseCourier(courier.id);
    if (vendor) await this.eraseVendor(vendor.id, userId);

    await unwrapVoid(
      this.db
        .from('profiles')
        .update({ full_name: DELETED_NAME, avatar_url: null, updated_at: new Date().toISOString() })
        .eq('id', userId)
    );
    await this.removeFolder(AVATARS_BUCKET, userId);

    // Revokes every refresh token, on every device. Best-effort: the deletion
    // below is what ends the account, and the caller's access token expires on
    // its own within the hour either way.
    if (accessToken) {
      const { error } = await this.db.auth.admin.signOut(accessToken, 'global');
      if (error) this.logger.warn(`Global sign-out before deleting ${userId} failed: ${error.message}`);
    }

    const { error } = await this.db.auth.admin.deleteUser(userId, true);
    if (error) {
      this.logger.error(`Auth soft-delete failed for ${userId}: ${error.message}`);
      throw new InternalServerErrorException('La suppression n’a pas pu être finalisée. Réessayez.');
    }

    this.logger.log(`Account ${userId} deleted at its holder's request`);
  }

  /**
   * An order in flight has two other people waiting on it. Refusing here is
   * what keeps a shopper from vanishing with a courier on the road, and a shop
   * from vanishing with paid orders in its queue.
   */
  private async assertNothingInProgress(userId: string, vendorId: string | null, courierId: string | null) {
    const asCustomer = await unwrap<{ id: string }[]>(
      this.db.from('orders').select('id').eq('customer_id', userId).not('status', 'in', FINISHED_ORDERS).limit(1)
    );
    if (asCustomer.length > 0) {
      throw new ConflictException(
        'Vous avez une commande en cours. Attendez sa livraison ou son annulation avant de supprimer votre compte.'
      );
    }

    if (vendorId) {
      const asVendor = await unwrap<{ id: string }[]>(
        this.db.from('orders').select('id').eq('vendor_id', vendorId).not('status', 'in', FINISHED_ORDERS).limit(1)
      );
      if (asVendor.length > 0) {
        throw new ConflictException(
          'Votre commerce a des commandes en cours. Terminez-les avant de supprimer votre compte.'
        );
      }
    }

    if (courierId) {
      const carrying = await unwrap<{ order_id: string }[]>(
        this.db.from('order_deliveries').select('order_id').eq('courier_id', courierId).is('delivered_at', null)
      );
      if (carrying.length > 0) {
        const open = await unwrap<{ id: string }[]>(
          this.db
            .from('orders')
            .select('id')
            .in('id', carrying.map((c) => c.order_id))
            .not('status', 'in', FINISHED_ORDERS)
            .limit(1)
        );
        if (open.length > 0) {
          throw new ConflictException('Terminez votre livraison en cours avant de supprimer votre compte.');
        }
      }
    }
  }

  private async eraseCustomerData(userId: string, email: string | null) {
    await unwrapVoid(this.db.from('addresses').delete().eq('profile_id', userId));
    await unwrapVoid(this.db.from('favorite_products').delete().eq('profile_id', userId));
    await unwrapVoid(this.db.from('favorite_vendors').delete().eq('profile_id', userId));
    await unwrapVoid(this.db.from('push_tokens').delete().eq('user_id', userId));
    if (email) await unwrapVoid(this.db.from('email_verification_codes').delete().eq('email', email));
    // Messages go with their conversation (`on delete cascade`).
    await unwrapVoid(this.db.from('support_conversations').delete().eq('customer_id', userId));
    // The order stays; the name it was placed under does not. The shop's
    // history falls back to its generic customer label.
    await unwrapVoid(this.db.from('orders').update({ customer_name: null }).eq('customer_id', userId));
  }

  private async eraseCourier(courierId: string) {
    await unwrapVoid(
      this.db
        .from('couriers')
        .update({
          full_name: DELETED_NAME,
          phone: '',
          photo_url: null,
          plate: null,
          licence_number: null,
          postal_code: null,
          is_online: false,
          status: 'suspended',
          status_reason: DELETED_REASON,
        })
        .eq('id', courierId)
    );
    await unwrapVoid(this.db.from('courier_insurance').delete().eq('courier_id', courierId));
    await unwrapVoid(this.db.from('courier_locations').delete().eq('courier_id', courierId));
  }

  private async eraseVendor(vendorId: string, ownerId: string) {
    await unwrapVoid(
      this.db
        .from('vendors')
        .update({ status: 'suspended', status_reason: DELETED_REASON, updated_at: new Date().toISOString() })
        .eq('id', vendorId)
    );
    // The business's own numbers (NEQ, GST/QST) stay with its sales, as tax
    // records. The person behind it and their papers do not. `payout_method`
    // goes with the bank letter because the table's check constraint refuses a
    // "paid by bank document" file that has no document.
    await unwrapVoid(
      this.db
        .from('vendor_registrations')
        .update({
          contact_name: DELETED_NAME,
          contact_phone: '',
          id_document_path: null,
          business_number_document_path: null,
          mapaq_document_path: null,
          bank_document_path: null,
          payout_method: null,
        })
        .eq('vendor_id', vendorId)
    );
    await this.removeFolder(MERCHANT_DOCUMENTS_BUCKET, `applications/${ownerId}`);
  }

  /**
   * Best-effort, unlike the rows: a file left behind is unreachable once the
   * path that pointed to it is gone, and failing the whole deletion over
   * Storage would leave the person with an account they asked to be rid of.
   * It is logged so an orphan can be cleaned up by hand.
   */
  private async removeFolder(bucket: string, folder: string) {
    const { data, error } = await this.db.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) {
      this.logger.warn(`Could not list ${bucket}/${folder} for deletion: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) return;

    const removed = await this.db.storage.from(bucket).remove(data.map((file) => `${folder}/${file.name}`));
    if (removed.error) this.logger.warn(`Could not empty ${bucket}/${folder}: ${removed.error.message}`);
  }
}
