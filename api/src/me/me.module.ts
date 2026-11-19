import { Module } from '@nestjs/common';

import { AccountDeletionService } from './account-deletion.service.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

@Module({
  controllers: [MeController],
  providers: [MeService, AccountDeletionService],
})
export class MeModule {}
