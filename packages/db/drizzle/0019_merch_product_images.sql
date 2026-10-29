CREATE TABLE "merch_product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"label" varchar(60),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merch_product_images_product_asset_unique" UNIQUE("product_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "merch_product_images" ADD CONSTRAINT "merch_product_images_product_id_merch_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merch_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_product_images" ADD CONSTRAINT "merch_product_images_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: each product's single photo becomes its first (cover) photo.
INSERT INTO "merch_product_images" ("product_id", "asset_id", "sort_order")
SELECT "id", "image_asset_id", 0 FROM "merch_products" WHERE "image_asset_id" IS NOT NULL;
