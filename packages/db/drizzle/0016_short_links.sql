ALTER TYPE "public"."page_redirect_type_enum" ADD VALUE 'link';--> statement-breakpoint
CREATE TABLE "short_link_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"field" varchar(32) NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by_member_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "short_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"target_url" text NOT NULL,
	"title" varchar(120) NOT NULL,
	"notes" text,
	"owner" varchar(80),
	"qr_scans" integer DEFAULT 0 NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL,
	"last_clicked_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by_member_id" uuid,
	"updated_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "short_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "short_link_history" ADD CONSTRAINT "short_link_history_link_id_short_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."short_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_link_history" ADD CONSTRAINT "short_link_history_changed_by_member_id_members_id_fk" FOREIGN KEY ("changed_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_updated_by_member_id_members_id_fk" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "short_link_history_idx_link" ON "short_link_history" USING btree ("link_id","changed_at");--> statement-breakpoint
CREATE INDEX "short_links_idx_created_by" ON "short_links" USING btree ("created_by_member_id");