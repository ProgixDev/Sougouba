import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createDbClient } from './client.js';
import type { Env } from '../config/env.js';

export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => createDbClient(config.get('DATABASE_URL', { infer: true })),
    },
  ],
  exports: [DB],
})
export class DbModule {}
