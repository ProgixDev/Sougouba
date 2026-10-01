import { Controller, Get, Inject, Injectable, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';

export interface Specialty {
  id: string;
  slug: string;
  vendorType: 'grocery' | 'restaurant';
  nameFr: string;
  nameEn: string;
}

const listSpecialtiesSchema = z.object({ type: z.enum(['grocery', 'restaurant']).optional() });
type ListSpecialtiesQuery = z.infer<typeof listSpecialtiesSchema>;

@Injectable()
export class SpecialtiesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * What a shop can call itself — the line under its name. Seeded in migration
   * `0033`; the back office owns the list from there. Only active entries: a
   * retired one stays on the shops that chose it but is no longer offered.
   */
  async list(type?: Specialty['vendorType']): Promise<Specialty[]> {
    let q = this.db
      .from('specialties')
      .select('id, slug, vendor_type, name_fr, name_en')
      .eq('is_active', true)
      .order('position', { ascending: true });
    if (type) q = q.eq('vendor_type', type);
    return camelize<Specialty[]>(await unwrap(q));
  }

  /** An active entry that belongs to this shop type, or null — registration must not take one from the other list. */
  async findActive(id: string, type: Specialty['vendorType']): Promise<Specialty | null> {
    const row = await unwrap<Record<string, unknown> | null>(
      this.db
        .from('specialties')
        .select('id, slug, vendor_type, name_fr, name_en')
        .eq('id', id)
        .eq('vendor_type', type)
        .eq('is_active', true)
        .maybeSingle()
    );
    return row ? camelize<Specialty>(row) : null;
  }
}

@ApiTags('catalog')
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialties: SpecialtiesService) {}

  /** Public, like `/categories` — the registration form reads it before the shop exists. */
  @Get()
  list(@Query(new ZodValidationPipe(listSpecialtiesSchema)) query: ListSpecialtiesQuery) {
    return this.specialties.list(query.type);
  }
}
