import type { User, UserRole, ID } from '../types';
import { delay } from './storage';
import { getSeed } from './seed';

export interface UserFilters {
  role?: UserRole;
  search?: string;
}

export async function listUsers(filters: UserFilters = {}): Promise<User[]> {
  await delay();
  let rows = getSeed().users;
  if (filters.role) rows = rows.filter((u) => u.role === filters.role);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  return rows;
}

export async function getUser(id: ID): Promise<User | undefined> {
  await delay(150, 300);
  return getSeed().users.find((u) => u.id === id);
}
