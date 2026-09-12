CREATE TYPE "public"."room_reservation_status_enum" AS ENUM('unsubmitted', 'pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "room_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "room_reservation_status_enum" DEFAULT 'unsubmitted' NOT NULL,
	"room" varchar(255),
	"reservation_number" varchar(64),
	"is_manual_override" boolean DEFAULT false NOT NULL,
	"last_announced_status" "room_reservation_status_enum",
	"last_announced_room" varchar(255),
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ping_creator_on_update" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "room_reservations" ADD CONSTRAINT "room_reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_reservations_idx_event_id" ON "room_reservations" USING btree ("event_id");