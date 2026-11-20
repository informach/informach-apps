CREATE INDEX "events_recreio_personal_cursor" ON "audit"."events" USING btree ("actor_id","created_at","id" collate "C") WHERE "audit"."events"."event_type" like 'recreio.%' and "audit"."events"."payload"->>'app'='recreio';--> statement-breakpoint
CREATE INDEX "recreio_space_invite_emitter_history" ON "recreio"."space_invites" USING btree ("invited_by_member_id","id");--> statement-breakpoint
CREATE INDEX "recreio_space_invite_target_history" ON "recreio"."space_invites" USING btree ("target_profile_id","id");--> statement-breakpoint
CREATE INDEX "recreio_space_invite_acceptor_history" ON "recreio"."space_invites" USING btree ("accepted_by_profile_id","id");--> statement-breakpoint
CREATE INDEX "recreio_stewardship_emitter_history" ON "recreio"."space_stewardship_requests" USING btree ("from_member_id","id");--> statement-breakpoint
CREATE INDEX "recreio_stewardship_recipient_history" ON "recreio"."space_stewardship_requests" USING btree ("to_member_id","id");--> statement-breakpoint
CREATE INDEX "recreio_profile_creation_personal_history" ON "recreio"."profile_creation_requests" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "recreio_funding_capture_personal_history" ON "recreio"."funding_captures" USING btree ("observation_id","provider_charge_id" collate "C");--> statement-breakpoint
CREATE INDEX "recreio_funding_observation_personal_history" ON "recreio"."funding_observations" USING btree ("payer_user_id","id");--> statement-breakpoint
CREATE INDEX "recreio_funding_source_personal_history" ON "recreio"."funding_source_periods" USING btree ("observation_id","provider_charge_id" collate "C","source_payment_period_id");--> statement-breakpoint
CREATE INDEX "recreio_billing_contract_personal_history" ON "recreio"."billing_contracts" USING btree ("payer_user_id","subscription_id");--> statement-breakpoint
CREATE INDEX "recreio_paired_guardian_history" ON "recreio"."paired_credentials" USING btree ("guardian_user_id","device_session_id");--> statement-breakpoint
CREATE INDEX "recreio_social_notice_personal_history" ON "recreio"."social_notices" USING btree ("guardian_user_id","id");--> statement-breakpoint
CREATE INDEX "recreio_visit_invite_origin_history" ON "recreio"."space_visit_invites" USING btree ("origin_profile_id","id");--> statement-breakpoint
CREATE INDEX "recreio_visit_invite_target_history" ON "recreio"."space_visit_invites" USING btree ("target_profile_id","id");