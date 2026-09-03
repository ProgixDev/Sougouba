ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_amount_cad" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_refund_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_reason" text;