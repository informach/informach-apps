CREATE INDEX "recreio_directed_guardian_actor_history" ON "recreio"."directed_invite_guardian_approvals" USING btree ("approved_by_user_id","invite_id","profile_id");--> statement-breakpoint
CREATE INDEX "recreio_directed_world_approval_actor_history" ON "recreio"."directed_invite_world_approvals" USING btree ("approved_by_user_id","invite_id");--> statement-breakpoint
CREATE INDEX "recreio_restriction_review_actor_history" ON "recreio"."restriction_reviews" USING btree ("actor_user_id","id");--> statement-breakpoint
CREATE INDEX "recreio_restriction_review_profile_history" ON "recreio"."restriction_reviews" USING btree ("profile_id","id");--> statement-breakpoint
CREATE INDEX "recreio_safety_report_reporter_history" ON "recreio"."safety_reports" USING btree ("reporter_profile_id","id");--> statement-breakpoint
CREATE INDEX "recreio_safety_report_actor_history" ON "recreio"."safety_reports" USING btree ("actor_user_id","id");--> statement-breakpoint
CREATE INDEX "recreio_safety_report_reviewer_history" ON "recreio"."safety_reports" USING btree ("review_actor_user_id","id");--> statement-breakpoint
CREATE INDEX "recreio_friend_consent_actor_history" ON "recreio"."friend_consents" USING btree ("approved_by_user_id","request_id","profile_id");--> statement-breakpoint
CREATE INDEX "recreio_stewardship_guardian_actor_history" ON "recreio"."stewardship_guardian_approvals" USING btree ("approved_by_user_id","request_id","profile_id");--> statement-breakpoint
CREATE INDEX "recreio_visit_guardian_actor_history" ON "recreio"."visit_invite_guardian_approvals" USING btree ("approved_by_user_id","invite_id","profile_id");--> statement-breakpoint
CREATE INDEX "recreio_visit_world_approval_actor_history" ON "recreio"."visit_invite_world_approvals" USING btree ("approved_by_user_id","invite_id");