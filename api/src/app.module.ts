import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AddressesModule } from './addresses/addresses.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { validateEnv } from './config/env.js';
import { CourierModule } from './courier/courier.module.js';
import { DbModule } from './db/db.module.js';
import { FavoritesModule } from './favorites/favorites.module.js';
import { GeoModule } from './geo/geo.module.js';
import { HealthModule } from './health/health.module.js';
import { LoyaltyModule } from './loyalty/loyalty.module.js';
import { MeModule } from './me/me.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Drives the dispatch loop — see `courier/dispatch.scheduler.ts`, including
    // its note on why this assumes a single instance today.
    ScheduleModule.forRoot(),
    DbModule,
    AuthModule,
    HealthModule,
    GeoModule,
    MeModule,
    AddressesModule,
    FavoritesModule,
    CatalogModule,
    LoyaltyModule,
    OrdersModule,
    CourierModule,
    BillingModule,
    AdminModule,
  ],
})
export class AppModule {}
