import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import type { CreateAdminInput } from './dto/admin.dto.js';

export interface AdminAccount {
  id: string;
  fullName: string;
  email: string | null;
  lastSignInAt: string | null;
  memberSince: string | null;
}

const NOT_FOUND = 'SGB05';
const REFUSED = 'SGB06';

/**
 * Who can open the back office, managed from the back office.
 *
 * **A new administrator always gets a new account.** Turning an existing one
 * into an admin would make a customer's or merchant's login a back-office
 * login, with whatever password habits came with it — and an account has one
 * role. So "add" creates an Auth user with a one-time password, shown once to
 * the administrator who created it, who passes it on; the new admin then sets
 * their own in "Mon compte".
 *
 * The Auth calls cannot share a transaction with the role and the audit line
 * (`admin_grant_admin` / `admin_revoke_admin`), so each side undoes or
 * reinforces the other: a role that could not be granted deletes the account
 * just created; a revoke bans the account after the role is gone.
 */
@Injectable()
export class AdminAccountsService {
  private readonly logger = new Logger(AdminAccountsService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async list(): Promise<AdminAccount[]> {
    const profiles = await unwrap<{ id: string; fullName: string | null; memberSince: string | null }[]>(
      this.db
        .from('profiles')
        .select('id, fullName:full_name, memberSince:member_since')
        .eq('role', 'admin')
        .order('full_name', { ascending: true })
    );
    if (profiles.length === 0) return [];
    const auth = await unwrap<{ id: string; email: string | null; last_sign_in_at: string | null }[]>(
      this.db.rpc('admin_auth_users', { p_ids: profiles.map((p) => p.id) })
    );
    const byId = new Map(auth.map((a) => [a.id, a]));
    return profiles.map((p) => ({
      id: p.id,
      fullName: p.fullName ?? '',
      email: byId.get(p.id)?.email ?? null,
      lastSignInAt: byId.get(p.id)?.last_sign_in_at ?? null,
      memberSince: p.memberSince,
    }));
  }

  async create(actorId: string, input: CreateAdminInput): Promise<{ admin: AdminAccount; temporaryPassword: string }> {
    const temporaryPassword = randomBytes(12).toString('base64url');
    const created = await this.db.auth.admin.createUser({
      email: input.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (created.error || !created.data.user) {
      if (created.error?.code === 'email_exists') {
        throw new ConflictException(
          'Ce courriel a déjà un compte Sougouba. Utilisez une adresse réservée à l’administration.'
        );
      }
      this.logger.error(`createUser failed: ${created.error?.code} ${created.error?.message}`);
      throw new InternalServerErrorException('Impossible de créer le compte');
    }
    const userId = created.data.user.id;

    try {
      await unwrapRpc<void>(
        this.db.rpc('admin_grant_admin', { p_actor_id: actorId, p_user_id: userId, p_full_name: input.fullName })
      );
    } catch (error) {
      // No half-made administrator: an Auth account with no role and a
      // password nobody was given is just a dangling login.
      await this.db.auth.admin
        .deleteUser(userId)
        .catch((cleanup: unknown) => this.logger.error(`Could not delete ${userId} after a failed grant: ${String(cleanup)}`));
      throw error;
    }

    const admin = (await this.list()).find((a) => a.id === userId);
    if (!admin) throw new InternalServerErrorException('Account created but not found');
    return { admin, temporaryPassword };
  }

  /**
   * The role goes first — that alone shuts the back office, since `AdminGuard`
   * reads it on every request — then the account is banned, so the login
   * stops working everywhere. A failed ban is logged, not thrown: access is
   * already gone, and the audit line already says so.
   */
  async revoke(actorId: string, userId: string, reason: string | undefined): Promise<void> {
    await unwrapRpc<void>(
      this.db.rpc('admin_revoke_admin', { p_actor_id: actorId, p_user_id: userId, p_reason: reason ?? '' }),
      (error) => {
        if (error.code === NOT_FOUND) throw new NotFoundException('Cet administrateur est introuvable');
        if (error.code === REFUSED) {
          throw new BadRequestException(
            actorId === userId
              ? 'Vous ne pouvez pas retirer votre propre accès.'
              : 'Le dernier administrateur ne peut pas être retiré.'
          );
        }
        throw new InternalServerErrorException('Database request failed');
      }
    );
    const { error } = await this.db.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    if (error) this.logger.error(`Could not ban former admin ${userId}: ${error.message}`);
  }
}
