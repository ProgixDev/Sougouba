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
import type { PostgrestError } from '@supabase/supabase-js';

import { slugify } from '../catalog/slugify.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { one } from '../db/embed.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import type { AdminRoleInput, CreateAdminInput } from './dto/admin.dto.js';
import { PERMISSION_GROUPS } from './permissions.js';

export interface AdminRoleSummary {
  id: string;
  slug: string;
  name: string;
}

export interface AdminAccount {
  id: string;
  fullName: string;
  email: string | null;
  lastSignInAt: string | null;
  memberSince: string | null;
  role: AdminRoleSummary | null;
}

export interface AdminRole extends AdminRoleSummary {
  description: string;
  permissions: string[];
  isSystem: boolean;
  /** Administrators who hold it — a role in use cannot be deleted. */
  adminCount: number;
}

/** What the dashboard needs to know about whoever is signed in. */
export interface CurrentAdmin {
  id: string;
  fullName: string;
  email: string | null;
  memberSince: string | null;
  lastSignInAt: string | null;
  role: (AdminRoleSummary & { description: string }) | null;
  permissions: string[];
}

const NOT_FOUND = 'SGB05';
const REFUSED = 'SGB06';
const NO_MANAGER_LEFT = 'SGB10';
const UNIQUE_VIOLATION = '23505';

/**
 * Who can open the back office, with which role — managed from the back office.
 *
 * **A new administrator always gets a new account.** Turning an existing one
 * into an admin would make a customer's or merchant's login a back-office
 * login, with whatever password habits came with it — and an account has one
 * role. So "add" creates an Auth user with a one-time password, shown once to
 * the administrator who created it; the new admin then sets their own in
 * "Mon compte".
 *
 * Roles (`0043`): five built-in ones nobody can edit, plus custom ones. Every
 * write below goes through one SQL function that applies the change and its
 * audit line together, and refuses anything that would leave nobody able to
 * manage administrators (SGB10).
 */
@Injectable()
export class AdminAccountsService {
  private readonly logger = new Logger(AdminAccountsService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  // ── the signed-in administrator ─────────────────────────────────────────

  async me(userId: string): Promise<CurrentAdmin> {
    const [row, auth] = await Promise.all([
      unwrap<{ id: string; fullName: string | null; memberSince: string | null; adminRole: unknown } | null>(
        this.db
          .from('profiles')
          .select('id, fullName:full_name, memberSince:member_since, adminRole:admin_roles(id, slug, name, description, permissions)')
          .eq('id', userId)
          .maybeSingle()
      ),
      unwrap<{ email: string | null; last_sign_in_at: string | null }[]>(
        this.db.rpc('admin_auth_users', { p_ids: [userId] })
      ),
    ]);
    if (!row) throw new NotFoundException('Profile not found');
    const role = one<AdminRoleSummary & { description: string; permissions: string[] }>(row.adminRole as never);
    return {
      id: row.id,
      fullName: row.fullName ?? '',
      email: auth[0]?.email ?? null,
      memberSince: row.memberSince,
      lastSignInAt: auth[0]?.last_sign_in_at ?? null,
      role: role ? { id: role.id, slug: role.slug, name: role.name, description: role.description } : null,
      permissions: role?.permissions ?? [],
    };
  }

  /** The catalogue the role editor draws its checkboxes from. */
  permissionCatalogue() {
    return PERMISSION_GROUPS;
  }

  // ── administrators ──────────────────────────────────────────────────────

  async list(): Promise<AdminAccount[]> {
    const profiles = await unwrap<
      { id: string; fullName: string | null; memberSince: string | null; adminRole: unknown }[]
    >(
      this.db
        .from('profiles')
        .select('id, fullName:full_name, memberSince:member_since, adminRole:admin_roles(id, slug, name)')
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
      role: one<AdminRoleSummary>(p.adminRole as never) ?? null,
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
        this.db.rpc('admin_grant_admin', {
          p_actor_id: actorId,
          p_user_id: userId,
          p_full_name: input.fullName,
          p_role_id: input.roleId,
        }),
        (error) => refusal(error, 'Ce rôle n’existe pas', 'Ce compte a déjà un rôle')
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

  async setRole(actorId: string, userId: string, roleId: string): Promise<AdminAccount> {
    await unwrapRpc<void>(
      this.db.rpc('admin_set_admin_role', { p_actor_id: actorId, p_user_id: userId, p_role_id: roleId }),
      (error) => refusal(error, 'Administrateur ou rôle introuvable', 'Changement impossible')
    );
    const admin = (await this.list()).find((a) => a.id === userId);
    if (!admin) throw new NotFoundException('Administrateur introuvable');
    return admin;
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
      (error) => refusal(error, 'Cet administrateur est introuvable', 'Vous ne pouvez pas retirer votre propre accès.')
    );
    const { error } = await this.db.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    if (error) this.logger.error(`Could not ban former admin ${userId}: ${error.message}`);
  }

  // ── roles ───────────────────────────────────────────────────────────────

  async listRoles(): Promise<AdminRole[]> {
    const rows = await unwrap<Record<string, unknown>[]>(
      this.db
        .from('admin_roles')
        .select('id, slug, name, description, permissions, isSystem:is_system, profiles(count)')
        .order('is_system', { ascending: false })
        .order('name', { ascending: true })
    );
    return rows.map(({ profiles, ...role }) => ({
      ...(role as Omit<AdminRole, 'adminCount'>),
      adminCount: (profiles as { count: number }[] | undefined)?.[0]?.count ?? 0,
    }));
  }

  async createRole(actorId: string, input: AdminRoleInput): Promise<AdminRole> {
    const saved = await this.saveRole(actorId, null, input);
    return this.role(saved.id as string);
  }

  async updateRole(actorId: string, id: string, input: AdminRoleInput): Promise<AdminRole> {
    await this.saveRole(actorId, id, input);
    return this.role(id);
  }

  async deleteRole(actorId: string, id: string): Promise<void> {
    await unwrapRpc<void>(
      this.db.rpc('admin_role_delete', { p_actor_id: actorId, p_id: id }),
      (error) =>
        refusal(
          error,
          'Ce rôle n’existe pas',
          'Ce rôle ne peut pas être supprimé : il est prédéfini, ou encore attribué à un administrateur.'
        )
    );
  }

  private async saveRole(actorId: string, id: string | null, input: AdminRoleInput) {
    return unwrapRpc<Record<string, unknown>>(
      this.db.rpc('admin_role_save', {
        p_actor_id: actorId,
        p_id: id as string,
        p_slug: slugify(input.name),
        p_name: input.name,
        p_description: input.description ?? '',
        p_permissions: [...new Set(input.permissions)],
      }),
      (error) => {
        if (error.code === UNIQUE_VIOLATION) throw new ConflictException('Un rôle porte déjà ce nom.');
        refusal(error, 'Ce rôle n’existe pas', 'Les rôles prédéfinis ne peuvent pas être modifiés.');
      }
    );
  }

  private async role(id: string): Promise<AdminRole> {
    const found = (await this.listRoles()).find((r) => r.id === id);
    if (!found) throw new NotFoundException('Ce rôle n’existe pas');
    return found;
  }
}

function refusal(error: PostgrestError, notFound: string, refused: string): never {
  if (error.code === NOT_FOUND) throw new NotFoundException(notFound);
  if (error.code === REFUSED) throw new BadRequestException(refused);
  if (error.code === NO_MANAGER_LEFT) {
    throw new BadRequestException(
      'Au moins un administrateur doit garder le droit de gérer les administrateurs. Donnez-le d’abord à quelqu’un d’autre.'
    );
  }
  throw new InternalServerErrorException('Database request failed');
}
