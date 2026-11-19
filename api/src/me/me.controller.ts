import { Body, Controller, Delete, Get, Headers, HttpCode, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { claimReferralSchema, type ClaimReferralInput } from './dto/claim-referral.dto.js';
import { setRoleSchema, type SetRoleInput } from './dto/set-role.dto.js';
import { updateMeSchema, type UpdateMeInput } from './dto/update-me.dto.js';
import { MeService } from './me.service.js';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly accountDeletion: AccountDeletionService
  ) {}

  @Get()
  getMe(@CurrentUser() userId: string) {
    return this.me.getMe(userId);
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(updateMeSchema))
  updateMe(@CurrentUser() userId: string, @Body() body: UpdateMeInput) {
    return this.me.updateMe(userId, body);
  }

  /**
   * Deletes the caller's own account — there is no id in the path, so there is
   * no way to aim this at someone else's. The raw token is passed along only
   * so every other device can be signed out with it.
   */
  @Delete()
  @HttpCode(204)
  deleteMe(@CurrentUser() userId: string, @Headers('authorization') authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : null;
    return this.accountDeletion.deleteAccount(userId, token || null);
  }

  @Patch('role')
  @UsePipes(new ZodValidationPipe(setRoleSchema))
  setRole(@CurrentUser() userId: string, @Body() body: SetRoleInput) {
    return this.me.setRole(userId, body.role);
  }

  @Post('referral')
  @UsePipes(new ZodValidationPipe(claimReferralSchema))
  claimReferral(@CurrentUser() userId: string, @Body() body: ClaimReferralInput) {
    return this.me.claimReferral(userId, body.code);
  }
}
