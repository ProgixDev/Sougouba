import { Global, Module } from '@nestjs/common';

import { AdminGuard } from './admin.guard.js';
import { SupabaseAuthGuard } from './supabase-auth.guard.js';

/** Global so any module can `@UseGuards(SupabaseAuthGuard)` without importing this one directly. */
@Global()
@Module({
  providers: [SupabaseAuthGuard, AdminGuard],
  exports: [SupabaseAuthGuard, AdminGuard],
})
export class AuthModule {}
