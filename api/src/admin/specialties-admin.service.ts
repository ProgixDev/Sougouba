import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { slugify } from '../catalog/slugify.js';
import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import type { CreateSpecialtyInput, UpdateSpecialtyInput } from './dto/admin.dto.js';

export interface AdminSpecialty {
  id: string;
  vendorType: 'grocery' | 'restaurant';
  slug: string;
  nameFr: string;
  nameEn: string;
  position: number;
  isActive: boolean;
  /** Shops whose line comes from this entry — what a rename would reach. */
  vendorCount: number;
}

/** `admin_specialty_save`'s refusal when the id names nothing. */
const NOT_FOUND = 'SGB05';
const UNIQUE_VIOLATION = '23505';

/**
 * The back office's side of the specialties list (`0033`): every entry,
 * retired ones included, and the one audited write (`admin_specialty_save`).
 *
 * The public `GET /specialties` stays as it was — active entries only, for the
 * registration form.
 */
@Injectable()
export class SpecialtiesAdminService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(): Promise<AdminSpecialty[]> {
    const rows = await unwrap<Record<string, unknown>[]>(
      this.db
        .from('specialties')
        .select('id, vendor_type, slug, name_fr, name_en, position, is_active, vendors(count)')
        .order('vendor_type', { ascending: true })
        .order('position', { ascending: true })
        .order('name_fr', { ascending: true })
    );
    return rows.map((row) => {
      const { vendors, ...rest } = row as { vendors?: { count: number }[] };
      return { ...camelize<Omit<AdminSpecialty, 'vendorCount'>>(rest), vendorCount: vendors?.[0]?.count ?? 0 };
    });
  }

  /**
   * A new entry goes to the end of its list unless told otherwise, and its slug
   * comes from the French name — the same rule shops' slugs follow.
   */
  async create(adminId: string, input: CreateSpecialtyInput): Promise<AdminSpecialty> {
    let position = input.position;
    if (position === undefined) {
      const last = await unwrap<{ position: number } | null>(
        this.db
          .from('specialties')
          .select('position')
          .eq('vendor_type', input.vendorType)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle()
      );
      position = (last?.position ?? 0) + 10;
    }
    const row = await this.save(adminId, {
      p_id: null,
      p_vendor_type: input.vendorType,
      p_slug: slugify(input.nameFr),
      p_name_fr: input.nameFr,
      p_name_en: input.nameEn,
      p_position: position,
      p_is_active: true,
    });
    return this.one(row.id as string);
  }

  /** Rename, reorder, retire or bring back. A French rename also reaches the shops that use it. */
  async update(adminId: string, id: string, patch: UpdateSpecialtyInput): Promise<AdminSpecialty> {
    const current = await unwrap<Record<string, unknown> | null>(
      this.db.from('specialties').select('*').eq('id', id).maybeSingle()
    );
    if (!current) throw new NotFoundException('Specialty not found');
    const before = camelize<AdminSpecialty>(current);
    await this.save(adminId, {
      p_id: id,
      p_vendor_type: before.vendorType,
      p_slug: before.slug,
      p_name_fr: patch.nameFr ?? before.nameFr,
      p_name_en: patch.nameEn ?? before.nameEn,
      p_position: patch.position ?? before.position,
      p_is_active: patch.isActive ?? before.isActive,
    });
    return this.one(id);
  }

  private async save(adminId: string, args: Record<string, unknown>) {
    return unwrapRpc<Record<string, unknown>>(
      this.db.rpc('admin_specialty_save', { p_admin_id: adminId, ...args } as never),
      (error) => {
        if (error.code === NOT_FOUND) throw new NotFoundException('Specialty not found');
        if (error.code === UNIQUE_VIOLATION) {
          throw new ConflictException('Une spécialité porte déjà ce nom. Choisissez-en un autre.');
        }
        throw new InternalServerErrorException('Database request failed');
      }
    );
  }

  private async one(id: string): Promise<AdminSpecialty> {
    const found = (await this.list()).find((s) => s.id === id);
    if (!found) throw new NotFoundException('Specialty not found');
    return found;
  }
}
