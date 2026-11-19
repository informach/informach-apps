CREATE INDEX "recreio_game_tickets_profile_history" ON "recreio"."game_tickets" USING btree ("profile_id","jti");--> statement-breakpoint
CREATE INDEX "recreio_rights_subject_retention" ON "recreio"."rights_subjects" USING btree ("phase","retained_until","operation_id");--> statement-breakpoint
CREATE INDEX "recreio_friend_code_profile_history" ON "recreio"."friend_codes" USING btree ("profile_id","id");--> statement-breakpoint
CREATE INDEX "recreio_friend_request_target_history" ON "recreio"."friend_requests" USING btree ("target_profile_id","id");--> statement-breakpoint
CREATE INDEX "recreio_friendship_higher_history" ON "recreio"."friendships" USING btree ("higher_profile_id","lower_profile_id");