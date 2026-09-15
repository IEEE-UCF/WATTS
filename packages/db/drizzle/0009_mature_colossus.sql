ALTER TABLE "members" ADD COLUMN "ieee_membership_number" varchar(32);--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "knight_connect_linked" boolean DEFAULT false NOT NULL;