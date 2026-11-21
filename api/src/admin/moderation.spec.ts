import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { toProduct, type ProductRow } from '../catalog/mappers.js';
import type { Db } from '../db/client.js';
import { ModerationService } from './moderation.service.js';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';

function service(error: { code: string; message: string } | null = null) {
  const rpc = vi.fn(() => Promise.resolve({ data: null, error }));
  return { moderation: new ModerationService({ rpc } as unknown as Db), rpc };
}

describe('review moderation', () => {
  it('requires a reason to hide a comment or remove a review, and not to undo either', async () => {
    const { moderation, rpc } = service();
    await expect(moderation.moderateReview(ADMIN, ID, { action: 'hide_comment' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(moderation.moderateReview(ADMIN, ID, { action: 'remove' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(rpc).not.toHaveBeenCalled();

    await moderation.moderateReview(ADMIN, ID, { action: 'restore' });
    expect(rpc).toHaveBeenCalledWith('admin_review_moderate', {
      p_admin_id: ADMIN,
      p_order_id: ID,
      p_action: 'restore',
      p_reason: '',
    });
  });

  it('answers 404 for an order with no review', async () => {
    const { moderation } = service({ code: 'SGB05', message: 'x' });
    await expect(
      moderation.moderateReview(ADMIN, ID, { action: 'remove', reason: 'Faux avis' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('coupon and product moderation', () => {
  it('maps "already ended" and "already hidden" to a 400 with a sentence', async () => {
    await expect(service({ code: 'SGB06', message: 'x' }).moderation.deactivateCoupon(ADMIN, ID, 'Abus')).rejects.toThrow(
      'Ce code est déjà terminé'
    );
    await expect(
      service({ code: 'SGB06', message: 'x' }).moderation.setProductHidden(ADMIN, ID, true, 'Contenu interdit')
    ).rejects.toThrow('Ce produit est déjà masqué');
  });

  it('hides through the audited function', async () => {
    const { moderation, rpc } = service();
    await moderation.setProductHidden(ADMIN, ID, true, 'Contenu interdit');
    expect(rpc).toHaveBeenCalledWith('admin_product_set_hidden', {
      p_admin_id: ADMIN,
      p_product_id: ID,
      p_hidden: true,
      p_reason: 'Contenu interdit',
    });
  });
});

describe("a hidden product in the merchant's own listing", () => {
  const row = {
    id: ID,
    vendorId: ADMIN,
    categoryId: ID,
    sectionId: ID,
    name: 'Banane',
    description: 'Banane',
    priceCad: '2.99',
    compareAtPriceCad: null,
    imageUrl: null,
    stockQty: 3,
    isAvailable: true,
    tags: [],
    nutritionCalories: null,
    nutritionProteinG: null,
    nutritionFatG: null,
    nutritionWeightG: null,
  } satisfies ProductRow;

  it('says so, with the reason, so the merchant knows why it left the catalogue', () => {
    expect(toProduct({ ...row, hiddenAt: '2026-11-21T10:00:00Z', hiddenReason: 'Contenu interdit' }).hiddenByAdmin).toEqual({
      at: '2026-11-21T10:00:00Z',
      reason: 'Contenu interdit',
    });
    expect(toProduct(row)).not.toHaveProperty('hiddenByAdmin');
  });
});
