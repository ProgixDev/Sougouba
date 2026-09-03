import { Controller, Get, Inject, Injectable } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { asc } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { categories } from '../db/schema/index.js';

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * The platform taxonomy — what search and the home grid filter on, as
   * distinct from a merchant's own `vendor_sections` headings. Seeded in
   * migration `0007`; admin-editable in Phase 8.
   *
   * Unpaginated on purpose: this is a fixed list of eight, read on nearly every
   * screen, and a `?limit=` on it would be ceremony around a table that will
   * never need a second page.
   */
  list() {
    return this.db.select().from(categories).orderBy(asc(categories.nameFr));
  }
}

@ApiTags('catalog')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }
}
