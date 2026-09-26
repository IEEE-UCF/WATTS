CREATE TYPE "public"."content_revision_status_enum" AS ENUM('pending', 'published', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."content_scope_type_enum" AS ENUM('global', 'committee', 'project');--> statement-breakpoint
CREATE TYPE "public"."media_asset_kind_enum" AS ENUM('image', 'animated', 'document');--> statement-breakpoint
CREATE TYPE "public"."officer_group_enum" AS ENUM('executive', 'chair');--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" varchar(96) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" "content_revision_status_enum" NOT NULL,
	"author_member_id" uuid,
	"reviewer_member_id" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_asset_kind_enum" NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"url" text NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"checksum_sha256" varchar(64),
	"alt" text,
	"source_filename" varchar(255),
	"uploaded_by_user_id" uuid,
	"scope_type" "content_scope_type_enum" DEFAULT 'global' NOT NULL,
	"scope_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "officer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid,
	"display_name" varchar(255) NOT NULL,
	"role_title" varchar(255) NOT NULL,
	"group" "officer_group_enum" DEFAULT 'chair' NOT NULL,
	"major" varchar(255),
	"year_label" varchar(64),
	"bio" text,
	"linkedin_url" varchar(500),
	"portrait_asset_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "officer_profiles_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
CREATE TABLE "page_editors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "content_scope_type_enum" NOT NULL,
	"scope_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"granted_by_member_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_editors_scope_member_unique" UNIQUE("scope_type","scope_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "site_media_slots" (
	"slot_key" varchar(96) PRIMARY KEY NOT NULL,
	"asset_id" uuid,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sponsorships" ALTER COLUMN "money_donated" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsorships" ALTER COLUMN "contact_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "tagline" varchar(255);--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "apply_url" varchar(500);--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "hero_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "gallery_asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "tagline" varchar(255);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hero_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "gallery_asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsorships" ADD COLUMN "logo_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "sponsorships" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_reviewer_member_id_members_id_fk" FOREIGN KEY ("reviewer_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_profiles" ADD CONSTRAINT "officer_profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_profiles" ADD CONSTRAINT "officer_profiles_portrait_asset_id_media_assets_id_fk" FOREIGN KEY ("portrait_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_editors" ADD CONSTRAINT "page_editors_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_editors" ADD CONSTRAINT "page_editors_granted_by_member_id_members_id_fk" FOREIGN KEY ("granted_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_media_slots" ADD CONSTRAINT "site_media_slots_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_media_slots" ADD CONSTRAINT "site_media_slots_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_revisions_idx_entity" ON "content_revisions" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "content_revisions_idx_status" ON "content_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_assets_idx_scope" ON "media_assets" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "media_assets_idx_created_at" ON "media_assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "officer_profiles_idx_active_sort" ON "officer_profiles" USING btree ("active","group","sort_order");--> statement-breakpoint
CREATE INDEX "page_editors_idx_member" ON "page_editors" USING btree ("member_id");