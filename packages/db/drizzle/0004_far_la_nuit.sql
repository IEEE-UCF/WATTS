CREATE TABLE "event_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"slug" varchar(32) NOT NULL,
	"color_id" varchar(2),
	"hex" varchar(7),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_labels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "label_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "time_zone" varchar(64) DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "google_calendar_event_id" varchar(256);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "discord_scheduled_event_id" varchar(64);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sync_status" varchar(16) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
CREATE INDEX "event_labels_idx_slug" ON "event_labels" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "event_labels_idx_sort_order" ON "event_labels" USING btree ("sort_order" int4_ops);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_label_id_event_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."event_labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_idx_label_id" ON "events" USING btree ("label_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "events_idx_google_calendar_event_id" ON "events" USING btree ("google_calendar_event_id" text_ops);--> statement-breakpoint
CREATE INDEX "events_idx_is_global" ON "events" USING btree ("is_global" bool_ops);