import { Global, Module } from '@nestjs/common';

import { NotifyService } from './notify.service.js';
import { FcmClient } from './fcm.client.js';
import { PushService } from './push.service.js';
import { PushTokensController } from './push-tokens.controller.js';

/** Global, like `MailModule`: orders, dispatch, delivery and the back office all raise events. */
@Global()
@Module({
  controllers: [PushTokensController],
  providers: [FcmClient, PushService, NotifyService],
  exports: [NotifyService],
})
export class NotificationsModule {}
