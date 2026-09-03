import { Module } from '@nestjs/common';

import { AuditService } from './audit.service.js';

/**
 * Its own module, small as it is, because the audit log is written from both
 * sides of a module boundary: `AdminModule`'s approvals, disputes and refunds,
 * and `LoyaltyModule`'s `SettingsService` — which is where the commission rate
 * actually changes.
 *
 * `AdminModule` already imports `LoyaltyModule`, so putting `AuditService` in
 * `AdminModule` and injecting it into `SettingsService` would close a cycle.
 * Both import this instead. `AuditService` depends only on the (global) `DB`
 * token, so there is nothing here to wire.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
