import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  sendSupportMessageSchema,
  type SendSupportMessageInput,
} from './dto/support.dto.js';
import { SupportService } from './support.service.js';

/**
 * The signed-in shopper's conversation with the support assistant.
 *
 * Always "the current one" rather than an id in the path: a shopper has one
 * open conversation at a time, and an id the client supplies is one more thing
 * to check ownership of. Rate-limited under `/support` (15/min, see
 * `common/rate-limit.ts`) — every message is a paid model call.
 */
@ApiTags('support')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('support/conversations/current')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  current(@CurrentUser() userId: string) {
    return this.support.current(userId);
  }

  @Post('messages')
  @UsePipes(new ZodValidationPipe(sendSupportMessageSchema))
  send(@CurrentUser() userId: string, @Body() body: SendSupportMessageInput) {
    return this.support.send(userId, body.content);
  }

  @Post('close')
  close(@CurrentUser() userId: string) {
    return this.support.close(userId);
  }
}
