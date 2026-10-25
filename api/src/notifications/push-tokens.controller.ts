import {
  Body,
  Controller,
  Delete,
  Put,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  registerPushTokenSchema,
  unregisterPushTokenSchema,
  type RegisterPushTokenInput,
  type UnregisterPushTokenInput,
} from './dto/push-token.dto.js';
import { PushService } from './push.service.js';

/**
 * The signed-in device's push registration.
 *
 * `PUT` because the app sends the whole state each time — on sign-in, on a
 * refreshed token, on a flipped switch or a changed language — and the same
 * call twice is the same row. The token travels in the body rather than the
 * path: `ExponentPushToken[…]` is not something to put through URL encoding.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me/push-token')
export class PushTokensController {
  constructor(private readonly push: PushService) {}

  @Put()
  @UsePipes(new ZodValidationPipe(registerPushTokenSchema))
  register(
    @CurrentUser() userId: string,
    @Body() body: RegisterPushTokenInput,
  ) {
    return this.push.register(userId, body);
  }

  @Delete()
  @UsePipes(new ZodValidationPipe(unregisterPushTokenSchema))
  unregister(
    @CurrentUser() userId: string,
    @Body() body: UnregisterPushTokenInput,
  ) {
    return this.push.unregister(userId, body.token);
  }
}
