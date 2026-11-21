import { apiDelete, apiGet, apiPatch, apiPost } from './client';

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

/** Whoever is signed in — what the dashboard draws its sidebar and buttons from. */
export interface CurrentAdmin {
  id: string;
  fullName: string;
  role: AdminRoleSummary | null;
  permissions: string[];
}

export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  return apiGet<CurrentAdmin>('/admin/me');
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
