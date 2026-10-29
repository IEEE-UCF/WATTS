CREATE TYPE "public"."merch_order_status_enum" AS ENUM('requested', 'approved', 'paid', 'delivered', 'denied', 'cancelled');--> statement-breakpoint
CREATE TABLE "merch_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_name" varchar(120) NOT NULL,
	"variant_label" varchar(24) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merch_order_items_order_variant_unique" UNIQUE("order_id","variant_id"),
	CONSTRAINT "merch_order_items_quantity_check" CHECK ("merch_order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "merch_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"member_id" uuid,
	"buyer_name" varchar(200),
	"buyer_email" varchar(320),
	"status" "merch_order_status_enum" DEFAULT 'requested' NOT NULL,
	"total_cents" integer NOT NULL,
	"note" text,
	"officer_note" text,
	"approved_at" timestamp with time zone,
	"approved_by_member_id" uuid,
	"paid_at" timestamp with time zone,
	"paid_by_member_id" uuid,
	"delivered_at" timestamp with time zone,
	"delivered_by_member_id" uuid,
	"closed_at" timestamp with time zone,
	"closed_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"image_asset_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merch_products_price_check" CHECK ("merch_products"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "merch_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"label" varchar(24) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merch_variants_product_label_unique" UNIQUE("product_id","label"),
	CONSTRAINT "merch_variants_reserved_check" CHECK ("merch_variants"."reserved" >= 0 AND "merch_variants"."reserved" <= "merch_variants"."stock")
);
--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD CONSTRAINT "merch_order_items_order_id_merch_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."merch_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD CONSTRAINT "merch_order_items_variant_id_merch_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."merch_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_approved_by_member_id_members_id_fk" FOREIGN KEY ("approved_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_paid_by_member_id_members_id_fk" FOREIGN KEY ("paid_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_delivered_by_member_id_members_id_fk" FOREIGN KEY ("delivered_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_closed_by_member_id_members_id_fk" FOREIGN KEY ("closed_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_products" ADD CONSTRAINT "merch_products_image_asset_id_media_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD CONSTRAINT "merch_variants_product_id_merch_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merch_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merch_order_items_idx_variant" ON "merch_order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "merch_orders_idx_status" ON "merch_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "merch_orders_idx_user" ON "merch_orders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merch_orders_open_unique" ON "merch_orders" USING btree ("user_id") WHERE "merch_orders"."status" in ('requested', 'approved', 'paid');--> statement-breakpoint
-- Starting catalog: the two shirts from Impress Ink invoice #110370 (Port & Company PC54,
-- 24 each: S 3 / M 9 / L 9 / XL 3), $15. Images are uploaded afterwards in /admin/merch.
WITH p AS (
	INSERT INTO "merch_products" ("name", "description", "price_cents", "sort_order") VALUES
		('T-Shirt 1 — Jet Black', 'Port & Company PC54 · 100% cotton · left-chest + back print', 1500, 0),
		('T-Shirt 2 — Graphite Heather', 'Port & Company PC54 · 100% cotton · left-chest + back print', 1500, 1)
	RETURNING "id"
)
INSERT INTO "merch_variants" ("product_id", "label", "stock", "sort_order")
SELECT p."id", v."label", v."stock", v."sort_order"
FROM p CROSS JOIN (VALUES ('S', 3, 0), ('M', 9, 1), ('L', 9, 2), ('XL', 3, 3)) AS v("label", "stock", "sort_order");
