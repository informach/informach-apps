CREATE TABLE "recreio"."personal_exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requester_user_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"device_session_id" uuid NOT NULL,
	"auth_session_id" text NOT NULL,
	"profile_kind" text NOT NULL,
	"policy_version" integer NOT NULL,
	"guardian_reference" uuid,
	"state" text NOT NULL,
	"reference" jsonb,
	"encrypted_bytes" "bytea",
	"captured_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_personal_export_state" CHECK ("recreio"."personal_exports"."state" in ('ready','revoked','expired')),
	CONSTRAINT "recreio_personal_export_profile" CHECK ("recreio"."personal_exports"."policy_version">0 and (("recreio"."personal_exports"."profile_kind"='adult' and "recreio"."personal_exports"."guardian_reference" is null) or ("recreio"."personal_exports"."profile_kind"='minor' and "recreio"."personal_exports"."guardian_reference" is not null))),
	CONSTRAINT "recreio_personal_export_window" CHECK ("recreio"."personal_exports"."expires_at"="recreio"."personal_exports"."captured_at"+interval '10 minutes' and "recreio"."personal_exports"."created_at">="recreio"."personal_exports"."captured_at" and "recreio"."personal_exports"."created_at"<"recreio"."personal_exports"."expires_at"),
	CONSTRAINT "recreio_personal_export_payload" CHECK ((
    ("recreio"."personal_exports"."state"='ready' and "recreio"."personal_exports"."cleared_at" is null and "recreio"."personal_exports"."encrypted_bytes" is not null and "recreio"."personal_exports"."reference" is not null
      and octet_length("recreio"."personal_exports"."encrypted_bytes") between 40 and 33555456
      and jsonb_typeof("recreio"."personal_exports"."reference")='object' and pg_column_size("recreio"."personal_exports"."reference")<=2048
      and "recreio"."personal_exports"."reference"->>'formato'='recreio-objeto-cifrado-v1'
      and "recreio"."personal_exports"."reference"->'contexto'->>'tipo'='exportacao' and "recreio"."personal_exports"."reference"->'contexto'->>'id'="recreio"."personal_exports"."id"::text)
    or ("recreio"."personal_exports"."state"<>'ready' and "recreio"."personal_exports"."encrypted_bytes" is null and "recreio"."personal_exports"."reference" is null and "recreio"."personal_exports"."cleared_at" is not null and "recreio"."personal_exports"."cleared_at">="recreio"."personal_exports"."created_at"
      and ("recreio"."personal_exports"."state"<>'expired' or "recreio"."personal_exports"."cleared_at">="recreio"."personal_exports"."expires_at"))) is true)
);
--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ADD CONSTRAINT "personal_exports_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ADD CONSTRAINT "personal_exports_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ADD CONSTRAINT "personal_exports_device_session_id_device_sessions_id_fk" FOREIGN KEY ("device_session_id") REFERENCES "recreio"."device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ADD CONSTRAINT "recreio_personal_export_native_session" FOREIGN KEY ("auth_session_id","requester_user_id") REFERENCES "core"."sessions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_personal_export_one_ready" ON "recreio"."personal_exports" USING btree ("requester_user_id") WHERE "recreio"."personal_exports"."state"='ready';--> statement-breakpoint
CREATE INDEX "recreio_personal_export_expiry" ON "recreio"."personal_exports" USING btree ("expires_at","id") WHERE "recreio"."personal_exports"."state"='ready';--> statement-breakpoint
CREATE INDEX "recreio_personal_export_cleared" ON "recreio"."personal_exports" USING btree ("cleared_at","id") WHERE "recreio"."personal_exports"."state"<>'ready';