CREATE TABLE "recreio"."world_visit_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"state" text DEFAULT 'prepared' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"admitted_at" timestamp with time zone,
	"permission_until" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	CONSTRAINT "recreio_visit_session_sid" UNIQUE("session_id"),
	CONSTRAINT "recreio_visit_session_state" CHECK ("recreio"."world_visit_sessions"."state" in ('prepared','active','closed')),
	CONSTRAINT "recreio_visit_session_time" CHECK ("recreio"."world_visit_sessions"."updated_at">="recreio"."world_visit_sessions"."created_at"),
	CONSTRAINT "recreio_visit_session_admission" CHECK (("recreio"."world_visit_sessions"."admitted_at" is null and "recreio"."world_visit_sessions"."permission_until" is null) or ("recreio"."world_visit_sessions"."admitted_at" is not null and "recreio"."world_visit_sessions"."permission_until" is not null and "recreio"."world_visit_sessions"."admitted_at">="recreio"."world_visit_sessions"."created_at" and "recreio"."world_visit_sessions"."admitted_at"<="recreio"."world_visit_sessions"."updated_at" and "recreio"."world_visit_sessions"."permission_until">"recreio"."world_visit_sessions"."admitted_at")),
	CONSTRAINT "recreio_visit_session_lifecycle" CHECK (("recreio"."world_visit_sessions"."state"='prepared' and "recreio"."world_visit_sessions"."admitted_at" is null and "recreio"."world_visit_sessions"."permission_until" is null and "recreio"."world_visit_sessions"."closed_at" is null and "recreio"."world_visit_sessions"."close_reason" is null) or ("recreio"."world_visit_sessions"."state"='active' and "recreio"."world_visit_sessions"."admitted_at" is not null and "recreio"."world_visit_sessions"."permission_until" is not null and "recreio"."world_visit_sessions"."permission_until">"recreio"."world_visit_sessions"."updated_at" and "recreio"."world_visit_sessions"."permission_until"<="recreio"."world_visit_sessions"."updated_at"+interval '45 seconds' and "recreio"."world_visit_sessions"."closed_at" is null and "recreio"."world_visit_sessions"."close_reason" is null) or ("recreio"."world_visit_sessions"."state"='closed' and "recreio"."world_visit_sessions"."closed_at" is not null and "recreio"."world_visit_sessions"."close_reason" is not null and "recreio"."world_visit_sessions"."closed_at">="recreio"."world_visit_sessions"."created_at" and "recreio"."world_visit_sessions"."closed_at"<="recreio"."world_visit_sessions"."updated_at" and "recreio"."world_visit_sessions"."close_reason" in ('left','replaced','session_ended','visit_ended','host_left','lease_lost')))
);
--> statement-breakpoint
ALTER TABLE "recreio"."world_visit_sessions" ADD CONSTRAINT "recreio_visit_session_sid_profile" FOREIGN KEY ("session_id","profile_id") REFERENCES "recreio"."game_sessions"("id","profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."world_visit_sessions" ADD CONSTRAINT "recreio_visit_session_grant" FOREIGN KEY ("visit_id","space_id","profile_id") REFERENCES "recreio"."world_visits"("id","space_id","visitor_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_visit_session_one_active" ON "recreio"."world_visit_sessions" USING btree ("visit_id") WHERE "recreio"."world_visit_sessions"."state"='active';--> statement-breakpoint
CREATE INDEX "recreio_visit_session_grant" ON "recreio"."world_visit_sessions" USING btree ("visit_id","id");--> statement-breakpoint
CREATE INDEX "recreio_visit_session_profile" ON "recreio"."world_visit_sessions" USING btree ("profile_id","created_at","id");--> statement-breakpoint
CREATE INDEX "recreio_visit_session_deadline" ON "recreio"."world_visit_sessions" USING btree ("permission_until","id") WHERE "recreio"."world_visit_sessions"."state"='active';