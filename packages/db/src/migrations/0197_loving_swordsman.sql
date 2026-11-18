CREATE TABLE "recreio"."stewardship_guardian_approvals" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"guardian_link_id" uuid NOT NULL,
	"approved_by_user_id" text,
	"access_generation" uuid NOT NULL,
	"policy_version" integer NOT NULL,
	"management_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_stewardship_guardian_revisions" CHECK ("recreio"."stewardship_guardian_approvals"."policy_version">0 and "recreio"."stewardship_guardian_approvals"."management_revision">0)
);
--> statement-breakpoint
ALTER TABLE "recreio"."stewardship_guardian_approvals" ADD CONSTRAINT "recreio_stewardship_guardian_request" FOREIGN KEY ("request_id") REFERENCES "recreio"."space_stewardship_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."stewardship_guardian_approvals" ADD CONSTRAINT "recreio_stewardship_guardian_actor" FOREIGN KEY ("approved_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."stewardship_guardian_approvals" ADD CONSTRAINT "recreio_stewardship_guardian_profile" FOREIGN KEY ("guardian_link_id","profile_id") REFERENCES "recreio"."guardian_links"("id","profile_id") ON DELETE cascade ON UPDATE no action;