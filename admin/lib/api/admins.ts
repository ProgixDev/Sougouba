import { tMaybe } from '../i18n';
import type { AuditEntry } from './audit';
import { apiDelete, apiGet, apiPatch, apiPost, type Page } from './client';

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
  /** The five built-in roles: shown, assignable, never editable. */
  isSystem: boolean;
  adminCount: number;
}

export interface PermissionGroup {
  area: string;
  permissions: readonly { key: string; label: string }[];
}

/*
 * The API words the permission catalogue and the built-in roles in French.
 * Both are fixed sets of codes, so their wording is also in the `admins`
 * dictionary, in both languages, and read from there by code. Whatever is not
 * listed — a permission added tomorrow, a custom role — shows as the API sent it.
 */

/** A group's name. It carries no code of its own: its permissions all start with one (`orders.view`, `orders.refund`). */
export function permissionAreaLabel(group: PermissionGroup): string {
  return tMaybe(`admins.permissionGroups.${group.permissions[0]?.key.split('.')[0]}`, group.area);
}

/** A permission's label: `payouts.run` is the message `admins.permissions.payouts_run`. */
export function permissionLabel(permission: { key: string; label: string }): string {
  return tMaybe(`admins.permissions.${permission.key.replace(/\./g, '_')}`, permission.label);
}

/** A role's name: translated for the five built-in ones (by slug), as it was typed for a custom one. */
export function roleName(role: { slug: string; name: string }): string {
  return tMaybe(`admins.systemRoles.${role.slug}.name`, role.name);
}

/** The same, for its description. */
export function roleDescription(role: { slug: string; description: string }): string {
  return tMaybe(`admins.systemRoles.${role.slug}.description`, role.description);
}

/** Whoever is signed in — what the dashboard draws its sidebar and buttons from. */
export interface CurrentAdmin {
  id: string;
  fullName: string;
  email: string | null;
  memberSince: string | null;
  lastSignInAt: string | null;
  role: (AdminRoleSummary & { description: string }) | null;
  permissions: string[];
}

export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  return apiGet<CurrentAdmin>('/admin/me');
}

/** Your own lines in the audit log — readable by any administrator, whatever their role. */
export async function getMyActivity(offset = 0, limit = 15): Promise<Page<AuditEntry>> {
  return apiGet<Page<AuditEntry>>('/admin/me/activity', { offset, limit });
}

/** Your display name — the profile endpoint every account uses, not an admin one. */
export async function updateMyName(fullName: string): Promise<void> {
  await apiPatch('/me', { fullName });
}

export async function listAdmins(): Promise<AdminAccount[]> {
  return apiGet<AdminAccount[]>('/admin/admins');
}

/**
 * A fresh account with a one-time password and a role. The password is in
 * this response and nowhere else — the API does not keep it — so it is shown
 * once.
 */
export async function createAdmin(input: { email: string; fullName: string; roleId: string }): Promise<{
  admin: AdminAccount;
  temporaryPassword: string;
}> {
  return apiPost('/admin/admins', input);
}

export async function setAdminRole(id: string, roleId: string): Promise<AdminAccount> {
  return apiPatch<AdminAccount>(`/admin/admins/${id}/role`, { roleId });
}

/** Never yourself, never the last administrator who can manage admins — the API refuses both. */
export async function revokeAdmin(id: string, reason?: string): Promise<void> {
  await apiPost(`/admin/admins/${id}/revoke`, reason ? { reason } : {});
}

export async function listRoles(): Promise<AdminRole[]> {
  return apiGet<AdminRole[]>('/admin/roles');
}

export async function getPermissionCatalogue(): Promise<PermissionGroup[]> {
  return apiGet<PermissionGroup[]>('/admin/permissions');
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export async function createRole(input: RoleInput): Promise<AdminRole> {
  return apiPost<AdminRole>('/admin/roles', input);
}

export async function updateRole(id: string, input: RoleInput): Promise<AdminRole> {
  return apiPatch<AdminRole>(`/admin/roles/${id}`, input);
}

export async function deleteRole(id: string): Promise<void> {
  await apiDelete(`/admin/roles/${id}`);
}
