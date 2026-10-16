import { Module } from '@nestjs/common';

import { GeoModule } from '../geo/geo.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { CourierController } from './courier.controller.js';
import { CouriersService } from './couriers.service.js';
import { DeliveryService } from './delivery.service.js';
import { DispatchScheduler } from './dispatch.scheduler.js';
import { DispatchService } from './dispatch.service.js';

/**
 * Couriers, dispatch and live delivery.
 *
 * `LoyaltyModule` is imported because completing a delivery is the moment
 * points are credited — the caller `creditForDeliveredOrder` has been waiting
 * for since Phase 4. `GeoModule` geocodes a courier's declared home area at
 * registration, so their first offers are ranked from somewhere real.
 */
@Module({
  imports: [GeoModule, LoyaltyModule],
  controllers: [CourierController],
  providers: [CouriersService, DispatchService, DeliveryService, DispatchScheduler],
  exports: [CouriersService, DispatchService, DispatchScheduler],
})
export class CourierModule {}
