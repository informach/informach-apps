CREATE INDEX "recreio_visit_invite_presence" ON "recreio"."space_visit_invites" USING btree ("host_presence_id","id");--> statement-breakpoint
CREATE INDEX "recreio_visit_guardian_link" ON "recreio"."visit_invite_guardian_approvals" USING btree ("guardian_link_id");--> statement-breakpoint
CREATE INDEX "recreio_visit_world_approval_guardian" ON "recreio"."visit_invite_world_approvals" USING btree ("guardian_link_id");--> statement-breakpoint
CREATE INDEX "recreio_visit_world_approval_member" ON "recreio"."visit_invite_world_approvals" USING btree ("space_id","approved_by_member_id");