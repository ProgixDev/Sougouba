-- Phase 0's placeholder RLS: enabled everywhere, zero policies yet.
-- With RLS on and no policy, `anon`/`authenticated` (PostgREST/Supabase
-- client roles) can read or write nothing at all — the safe default until
-- each domain's real policies land starting Phase 1. This connection (the
-- API's own, via `DATABASE_URL`) is unaffected: it authenticates as a role
-- RLS doesn't apply to, and authorization for everything it does lives in
-- NestJS guards, not here. See docs/BACKEND-BUILD-PHASES.md, rule 5.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "favorite_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "favorite_vendors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendor_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendor_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendor_hours" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendor_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courier_issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "couriers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courier_insurance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courier_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courier_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dispatch_offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "merchant_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
