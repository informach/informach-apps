CREATE TABLE "recreio"."world_host_presences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"host_profile_id" uuid NOT NULL,
	"host_session_id" uuid NOT NULL,
	"host_member_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"fence" integer NOT NULL,
	"client_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"retain_until" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	CONSTRAINT "recreio_host_presence_client_key" UNIQUE("instance_id","client_key"),
	CONSTRAINT "recreio_host_presence_identity" UNIQUE("id","space_id","host_profile_id","host_session_id","host_member_id"),
	CONSTRAINT "recreio_host_presence_fence" CHECK ("recreio"."world_host_presences"."fence">=0),
	CONSTRAINT "recreio_host_presence_hash" CHECK ("recreio"."world_host_presences"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_host_presence_lifecycle" CHECK (("recreio"."world_host_presences"."state"='active' and "recreio"."world_host_presences"."closed_at" is null and "recreio"."world_host_presences"."close_reason" is null) or ("recreio"."world_host_presences"."state"='closed' and "recreio"."world_host_presences"."closed_at" is not null and "recreio"."world_host_presences"."close_reason" is not null and "recreio"."world_host_presences"."closed_at">="recreio"."world_host_presences"."created_at" and "recreio"."world_host_presences"."closed_at"<="recreio"."world_host_presences"."updated_at" and "recreio"."world_host_presences"."close_reason" in ('left','session_ended','lease_lost','policy_changed','expired','revoked'))),
	CONSTRAINT "recreio_host_presence_window" CHECK ("recreio"."world_host_presences"."valid_until">"recreio"."world_host_presences"."created_at" and "recreio"."world_host_presences"."valid_until"<="recreio"."world_host_presences"."created_at"+interval '24 hours' and "recreio"."world_host_presences"."retain_until"="recreio"."world_host_presences"."valid_until"+interval '720 hours'),
	CONSTRAINT "recreio_host_presence_freshness" CHECK ("recreio"."world_host_presences"."updated_at">="recreio"."world_host_presences"."created_at" and "recreio"."world_host_presences"."expires_at">"recreio"."world_host_presences"."created_at" and "recreio"."world_host_presences"."expires_at"<="recreio"."world_host_presences"."valid_until" and ("recreio"."world_host_presences"."state"<>'active' or ("recreio"."world_host_presences"."expires_at">"recreio"."world_host_presences"."updated_at" and "recreio"."world_host_presences"."expires_at"<="recreio"."world_host_presences"."updated_at"+interval '45 seconds')))
);
--> statement-breakpoint
ALTER TABLE "recreio"."world_host_presences" ADD CONSTRAINT "recreio_host_presence_member" FOREIGN KEY ("space_id","host_member_id","host_profile_id") REFERENCES "recreio"."space_members"("space_id","id","profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."world_host_presences" ADD CONSTRAINT "recreio_host_presence_session" FOREIGN KEY ("host_session_id","host_profile_id") REFERENCES "recreio"."game_sessions"("id","profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."world_host_presences" ADD CONSTRAINT "recreio_host_presence_lease" FOREIGN KEY ("space_id","fence") REFERENCES "recreio"."space_leases"("space_id","fence") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."world_host_presences" ADD CONSTRAINT "recreio_host_presence_instance" FOREIGN KEY ("instance_id") REFERENCES "recreio"."game_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_host_presence_one_active" ON "recreio"."world_host_presences" USING btree ("space_id","host_profile_id") WHERE "recreio"."world_host_presences"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_host_presence_expiry" ON "recreio"."world_host_presences" USING btree ("expires_at","id") WHERE "recreio"."world_host_presences"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_host_presence_retention" ON "recreio"."world_host_presences" USING btree ("retain_until","id") WHERE "recreio"."world_host_presences"."closed_at" is not null;--> statement-breakpoint
CREATE INDEX "recreio_host_presence_profile" ON "recreio"."world_host_presences" USING btree ("host_profile_id","created_at");