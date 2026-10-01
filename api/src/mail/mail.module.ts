import { Global, Module } from '@nestjs/common';

import { MailService } from './mail.service.js';

/** Global, like `DbModule`: order receipts and payout notices will want it too. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
