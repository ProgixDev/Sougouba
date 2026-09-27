DROP INDEX "vendors_owner_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_owner_id_unique" ON "vendors" USING btree ("owner_id");