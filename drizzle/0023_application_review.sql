ALTER TYPE "public"."vendor_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."courier_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;