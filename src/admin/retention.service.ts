import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, isNotNull, lt, notExists, sql } from 'drizzle-orm';

import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { courierLocations, deliveryProofs, disputes, platformSettings } from '../db/schema/index.js';

export type PurgeReport = {
  courierLocations: number;
  deliveryProofs: number;
  /** Proofs old enough to purge but held back — see `skippedReason`. */
  deliveryProofsHeld: number;
  skippedReason?: string;
};

/**
 * Deleting what we said we would delete.
 *
 * The privacy policy commits to retention periods, and a stated period that no
 * code enforces is not a retention policy — it is a claim. This is the code.
 *
 * Both periods are read from `platform_settings` on every run rather than
 * baked in, so the number in the policy and the number the purge uses cannot
 * drift apart, and changing one is an audited admin action.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: ConfigService<Env, true>
  ) {}

  async purge(): Promise<PurgeReport> {
    const [settings] = await this.db
      .select({
        locationDays: platformSettings.courierLocationRetentionDays,
        proofDays: platformSettings.deliveryProofRetentionDays,
      })
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .limit(1);

    // No settings row means no stated retention period, which means nothing has
    // been promised and nothing should be destroyed on a guess.
    if (!settings) {
      this.logger.warn('No platform_settings row — skipping the retention purge rather than guessing a period');
      return { courierLocations: 0, deliveryProofs: 0, deliveryProofsHeld: 0, skippedReason: 'no settings row' };
    }

    return {
      courierLocations: await this.purgeCourierLocations(settings.locationDays),
      ...(await this.purgeDeliveryProofs(settings.proofDays)),
    };
  }

  /**
   * The GPS trail. A plain delete: nothing downstream reads a ping older than
   * the live map, and the distance that sets a courier's pay was frozen onto
   * `order_deliveries` at delivery rather than re-derived from these rows.
   */
  private async purgeCourierLocations(days: number): Promise<number> {
    const deleted = await this.db
      .delete(courierLocations)
      .where(lt(courierLocations.recordedAt, cutoff(days)))
      .returning({ id: courierLocations.id });

    if (deleted.length > 0) {
      this.logger.log(`Retention: deleted ${deleted.length} courier location ping(s) older than ${days} days`);
    }
    return deleted.length;
  }

  /**
   * Signatures and delivery photos.
   *
   * Two things make this harder than the GPS trail, and both are the kind of
   * detail that turns a purge into a liability:
   *
   * **The row is not the data.** `image_path` points into the private
   * `delivery-proofs` Storage bucket; the bytes live there. Deleting the row
   * without deleting the object destroys the *index* to a photograph of
   * somebody's front door while leaving the photograph itself in the bucket
   * forever — strictly worse than not purging, because now nothing even knows
   * it is there. So a proof carrying an `image_path` is only deleted once the
   * object is gone, and if Storage cannot be reached the row stays.
   *
   * **An unresolved dispute outranks the clock.** A proof is the evidence for
   * "it never arrived". Destroying it while that argument is live would leave
   * the platform ruling on a dispute having deleted the only thing that answers
   * it. Held indefinitely until the dispute is settled, then subject to the
   * ordinary period.
   */
  private async purgeDeliveryProofs(
    days: number
  ): Promise<{ deliveryProofs: number; deliveryProofsHeld: number; skippedReason?: string }> {
    const expired = and(
      lt(deliveryProofs.at, cutoff(days)),
      // `notExists` rather than a join: a proof with no dispute row at all must
      // still be purged, and an inner join would silently keep every one of them.
      notExists(
        this.db
          .select({ one: sql`1` })
          .from(disputes)
          .where(and(eq(disputes.orderId, deliveryProofs.orderId), inArray(disputes.status, ['open', 'answered'])))
      )
    );

    // Anything with an image can only go once Storage can go with it.
    const withImage = await this.db
      .select({ orderId: deliveryProofs.orderId, imagePath: deliveryProofs.imagePath })
      .from(deliveryProofs)
      .where(and(expired, isNotNull(deliveryProofs.imagePath)));

    if (withImage.length > 0 && !this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true })) {
      // Loud, and it does not proceed. Deleting these rows now would orphan the
      // images rather than remove them.
      this.logger.warn(
        `Retention: ${withImage.length} delivery proof(s) are past their ${days}-day period but carry a Storage ` +
          'image, and SUPABASE_SERVICE_ROLE_KEY is not set — the objects cannot be deleted, so the rows are kept. ' +
          'Set the key to complete the purge; deleting the rows alone would leave the images in the bucket with ' +
          'nothing pointing at them.'
      );
    }

    // Proofs with no image — a plain "left at the door" note, or a signature
    // method that never produced a file — have nothing in Storage to wait for.
    const deleted = await this.db
      .delete(deliveryProofs)
      .where(and(expired, sql`${deliveryProofs.imagePath} is null`))
      .returning({ orderId: deliveryProofs.orderId });

    if (deleted.length > 0) {
      this.logger.log(`Retention: deleted ${deleted.length} delivery proof(s) older than ${days} days`);
    }

    return {
      deliveryProofs: deleted.length,
      deliveryProofsHeld: withImage.length,
      ...(withImage.length > 0 ? { skippedReason: 'SUPABASE_SERVICE_ROLE_KEY not set; Storage objects cannot be deleted' } : {}),
    };
  }
}

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
