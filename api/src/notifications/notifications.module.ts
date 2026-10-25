import { Global, Module } from '@nestjs/common';

import { NotifyService } from './notify.service.js';
import { PushService } from './push.service.js';
import { PushTokensController } from './push-tokens.controller.js';

/** Global, like `MailModule`: orders, dispatch, delivery and the back office all raise events. */
@Global()
@Module({
  controllers: [PushTokensController],
  providers: [PushService, NotifyService],
  exports: [NotifyService],
})
export class NotificationsModule {}
