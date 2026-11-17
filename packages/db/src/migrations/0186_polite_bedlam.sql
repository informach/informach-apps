ALTER TABLE "recreio"."friend_consents" DROP CONSTRAINT "friend_consents_request_id_friend_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" DROP CONSTRAINT "friend_consents_guardian_link_id_guardian_links_id_fk";
--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" DROP CONSTRAINT "friend_requests_code_id_friend_codes_id_fk";
--> statement-breakpoint
ALTER TABLE "recreio"."friendships" DROP CONSTRAINT "friendships_request_id_friend_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "recreio"."social_notices" DROP CONSTRAINT "social_notices_request_id_friend_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" ADD CONSTRAINT "recreio_friend_consent_request_participants" FOREIGN KEY ("request_id","request_origin_profile_id","request_target_profile_id") REFERENCES "recreio"."friend_requests"("id","origin_profile_id","target_profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" ADD CONSTRAINT "recreio_friend_consent_guardian_profile" FOREIGN KEY ("guardian_link_id","profile_id") REFERENCES "recreio"."guardian_links"("id","profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" ADD CONSTRAINT "recreio_friend_request_code_target" FOREIGN KEY ("code_id","target_profile_id") REFERENCES "recreio"."friend_codes"("id","profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friendships" ADD CONSTRAINT "recreio_friendship_accepted_pair" FOREIGN KEY ("request_id","lower_profile_id","higher_profile_id","request_state") REFERENCES "recreio"."friend_requests"("id","lower_profile_id","higher_profile_id","state") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."social_notices" ADD CONSTRAINT "recreio_social_notice_request_participants" FOREIGN KEY ("request_id","request_origin_profile_id","request_target_profile_id") REFERENCES "recreio"."friend_requests"("id","origin_profile_id","target_profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" ADD CONSTRAINT "recreio_friend_consent_participant" CHECK ("recreio"."friend_consents"."profile_id" in ("recreio"."friend_consents"."request_origin_profile_id","recreio"."friend_consents"."request_target_profile_id"));--> statement-breakpoint
ALTER TABLE "recreio"."friendships" ADD CONSTRAINT "recreio_friendship_request_state" CHECK ("recreio"."friendships"."request_state"='accepted');--> statement-breakpoint
ALTER TABLE "recreio"."social_notices" ADD CONSTRAINT "recreio_social_notice_participant" CHECK ("recreio"."social_notices"."profile_id" in ("recreio"."social_notices"."request_origin_profile_id","recreio"."social_notices"."request_target_profile_id"));