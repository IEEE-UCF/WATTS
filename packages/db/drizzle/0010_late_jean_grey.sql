CREATE TYPE "public"."project_membership_request_status_enum" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TABLE "project_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"slug" varchar(32) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "project_membership_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" "project_membership_request_status_enum" DEFAULT 'pending' NOT NULL,
	"message" text,
	"requested_by_member_id" uuid NOT NULL,
	"reviewed_by_member_id" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "discord_lead_role_id" varchar(64);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "discord_channel_id" varchar(64);--> statement-breakpoint
ALTER TABLE "project_membership_requests" ADD CONSTRAINT "project_membership_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership_requests" ADD CONSTRAINT "project_membership_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership_requests" ADD CONSTRAINT "project_membership_requests_requested_by_member_id_members_id_fk" FOREIGN KEY ("requested_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership_requests" ADD CONSTRAINT "project_membership_requests_reviewed_by_member_id_members_id_fk" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_categories_idx_slug" ON "project_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "project_categories_idx_sort_order" ON "project_categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "project_membership_requests_idx_project_id" ON "project_membership_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_membership_requests_idx_member_id" ON "project_membership_requests" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "project_membership_requests_idx_status" ON "project_membership_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_membership_requests_pending_unique" ON "project_membership_requests" USING btree ("project_id","member_id") WHERE "project_membership_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_category_id_project_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."project_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_idx_category_id" ON "projects" USING btree ("category_id");