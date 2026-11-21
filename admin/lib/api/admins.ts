import { apiGet, apiPost } from './client';

export interface AdminAccount {
  id: string;
  fullName: string;
  email: string | null;
  lastSignInAt: string | null;
  memberSince: string | null;
}

export async function listAdmins(): Promise<AdminAccount[]> {
  return apiGet<AdminAccount[]>('/admin/admins');
}

/**
 * A fresh account with a one-time password. The password is in this response
 * and nowhere else — the API does not keep it — so it is shown once.
 */
export async function createAdmin(input: { email: string; fullName: string }): Promise<{
  admin: AdminAccount;
  temporaryPassword: string;
}> {
  return apiPost('/admin/admins', input);
}

/** Never yourself, never the last administrator — the API refuses both. */
export async function revokeAdmin(id: string, reason?: string): Promise<void> {
  await apiPost(`/admin/admins/${id}/revoke`, reason ? { reason } : {});
}
