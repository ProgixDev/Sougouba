import { Module } from '@nestjs/common';

import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { OpenAiClient } from './openai.client.js';
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  imports: [LoyaltyModule],
  controllers: [SupportController],
  providers: [SupportService, OpenAiClient],
})
export class SupportModule {}
