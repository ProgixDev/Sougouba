import { apiGet, apiPatch, apiPost } from './client';

/** One entry of the shop specialties list — the line under a shop's name. */
export interface AdminSpecialty {
  id: string;
  vendorType: 'grocery' | 'restaurant';
  slug: string;
  nameFr: string;
  nameEn: string;
  position: number;
  /** Retired entries are no longer offered at registration; shops that chose one keep it. */
  isActive: boolean;
  /** Shops whose line comes from this entry — what a French rename reaches. */
  vendorCount: number;
}

export async function listSpecialties(): Promise<AdminSpecialty[]> {
  return apiGet<AdminSpecialty[]>('/admin/specialties');
}

export async function createSpecialty(input: {
  vendorType: AdminSpecialty['vendorType'];
  nameFr: string;
  nameEn: string;
}): Promise<AdminSpecialty> {
  return apiPost<AdminSpecialty>('/admin/specialties', input);
}

/** Rename, reorder, retire or bring back. The type cannot change. */
export async function updateSpecialty(
  id: string,
  patch: Partial<Pick<AdminSpecialty, 'nameFr' | 'nameEn' | 'position' | 'isActive'>>
): Promise<AdminSpecialty> {
  return apiPatch<AdminSpecialty>(`/admin/specialties/${id}`, patch);
}
