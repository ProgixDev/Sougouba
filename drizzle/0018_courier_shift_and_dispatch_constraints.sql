DROP INDEX "couriers_user_id_idx";--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN "is_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "couriers_user_id_unique" ON "couriers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "couriers_dispatchable_idx" ON "couriers" USING btree ("status","is_online");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_offers_one_per_order_courier" ON "dispatch_offers" USING btree ("order_id","courier_id");--> statement-breakpoint
CREATE INDEX "dispatch_offers_pending_idx" ON "dispatch_offers" USING btree ("expires_at") WHERE "dispatch_offers"."outcome" is null;