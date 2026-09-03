CREATE INDEX "vendor_categories_category_id_idx" ON "vendor_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "courier_locations_order_id_idx" ON "courier_locations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_deliveries_courier_id_idx" ON "order_deliveries" USING btree ("courier_id");