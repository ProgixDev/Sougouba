import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { paginationSchema } from '../catalog/dto/query.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { LoyaltyService } from './loyalty.service.js';
import { SettingsService } from './settings.service.js';

const historyQuerySchema = paginationSchema;
type HistoryQuery = z.infer<typeof historyQuerySchema>;

/**
 * The shopper's own points wallet. Read-only: points move as a *consequence* of
 * an order being delivered or paid for, never because someone asked for them.
 */
@ApiTags('loyalty')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me/loyalty')
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly settings: SettingsService
  ) {}

  @Get('balance')
  async balance(@CurrentUser() userId: string) {
    const [points, rates] = await Promise.all([this.loyalty.balance(userId), this.settings.loyaltyRates()]);
    return {
      points,
      // What they are worth today, so the app doesn't have to hold a conversion
      // rate that an admin can change.
      valueCad: Math.round((points / rates.pointsPerCadRedeemed) * 100) / 100,
      pointsPerCadRedeemed: rates.pointsPerCadRedeemed,
      maxRedemptionShare: rates.maxRedemptionShare,
    };
  }

  @Get('history')
  history(@CurrentUser() userId: string, @Query(new ZodValidationPipe(historyQuerySchema)) query: HistoryQuery) {
    return this.loyalty.history(userId, query.limit, query.offset);
  }

  @Get('referral-stats')
  referralStats(@CurrentUser() userId: string) {
    return this.loyalty.referralStats(userId);
  }
}
