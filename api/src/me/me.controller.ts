import { Body, Controller, Get, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { claimReferralSchema, type ClaimReferralInput } from './dto/claim-referral.dto.js';
import { setRoleSchema, type SetRoleInput } from './dto/set-role.dto.js';
import { updateMeSchema, type UpdateMeInput } from './dto/update-me.dto.js';
import { MeService } from './me.service.js';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  getMe(@CurrentUser() userId: string) {
    return this.me.getMe(userId);
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(updateMeSchema))
  updateMe(@CurrentUser() userId: string, @Body() body: UpdateMeInput) {
    return this.me.updateMe(userId, body);
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
