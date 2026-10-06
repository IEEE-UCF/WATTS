CREATE TYPE "public"."page_redirect_type_enum" AS ENUM('event', 'project');--> statement-breakpoint
CREATE TABLE "page_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "page_redirect_type_enum" NOT NULL,
	"old_slug" varchar(64) NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_redirects_type_old_slug_unique" UNIQUE("type","old_slug")
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_slug_unique";--> statement-breakpoint
-- Hand-edited from `ADD COLUMN "number" serial NOT NULL` so existing events are
-- numbered in the order they were created (serial would use physical row order).
-- The end state is identical to a serial column: events_number_seq, owned by the column.
ALTER TABLE "events" ADD COLUMN "number" integer;--> statement-breakpoint
UPDATE "events" SET "number" = s.rn FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id")::int AS rn FROM "events") s WHERE "events"."id" = s."id";--> statement-breakpoint
CREATE SEQUENCE "events_number_seq" OWNED BY "events"."number";--> statement-breakpoint
SELECT setval('"events_number_seq"', (SELECT coalesce(max("number"), 0) + 1 FROM "events"), false);--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "number" SET DEFAULT nextval('"events_number_seq"');--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "page_redirects_idx_target_id" ON "page_redirects" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "events_idx_slug" ON "events" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_number_unique" UNIQUE("number");