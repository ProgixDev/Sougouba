import { apiGet, apiGetOrNull, type Page } from './client';
import type { AdminUserDetail, AdminUserListItem, ID, UserRole } from '../types';

export interface UserFilters {
  role?: UserRole | 'admin';
  search?: string;
}

/**
 * The account directory.
 *
 * `email` comes from `auth.users`, joined server-side — it is not on
 * `profiles`, and the mock could only offer it because its users were
 * invented. Search runs server-side over name and email.
 */
export async function listUsers(filters: UserFilters = {}, limit = 100): Promise<AdminUserListItem[]> {
  const page = await apiGet<Page<AdminUserListItem>>('/admin/users', {
    role: filters.role,
    search: filters.search?.trim() || undefined,
    limit,
  });
  return page.items;
}

export async function getUser(id: ID): Promise<AdminUserDetail | null> {
  return apiGetOrNull<AdminUserDetail>(`/admin/users/${id}`);
}
