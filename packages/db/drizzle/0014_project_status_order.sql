CREATE TYPE "public"."project_status_enum" AS ENUM('current', 'past');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" "project_status_enum" DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Keep today's order (oldest first) as the starting order.
UPDATE "projects" SET "sort_order" = s.rn FROM (SELECT "id", (row_number() OVER (ORDER BY "created_at", "id") - 1)::int AS rn FROM "projects") s WHERE "projects"."id" = s."id";
