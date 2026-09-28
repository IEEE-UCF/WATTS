CREATE TYPE "public"."graduation_term_enum" AS ENUM('spring', 'summer', 'fall');--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "graduation_term" "graduation_term_enum";--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "additional_majors" "major_enum"[] DEFAULT '{}' NOT NULL;