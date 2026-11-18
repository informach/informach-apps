ALTER TABLE "recreio"."friend_consents" ADD COLUMN "request_origin_profile_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" ADD COLUMN "request_target_profile_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" ADD COLUMN "lower_profile_id" uuid GENERATED ALWAYS AS (least("origin_profile_id","target_profile_id")) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" ADD COLUMN "higher_profile_id" uuid GENERATED ALWAYS AS (greatest("origin_profile_id","target_profile_id")) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."friendships" ADD COLUMN "request_state" text DEFAULT 'accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."social_notices" ADD COLUMN "request_origin_profile_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."social_notices" ADD COLUMN "request_target_profile_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."guardian_links" ADD CONSTRAINT "recreio_guardian_identity_profile" UNIQUE("id","profile_id");--> statement-breakpoint
ALTER TABLE "recreio"."friend_codes" ADD CONSTRAINT "recreio_friend_code_identity_profile" UNIQUE("id","profile_id");--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" ADD CONSTRAINT "recreio_friend_request_identity_pair_state" UNIQUE("id","lower_profile_id","higher_profile_id","state");--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" ADD CONSTRAINT "recreio_friend_request_identity_participants" UNIQUE("id","origin_profile_id","target_profile_id");