CREATE TABLE "recreio"."rights_preparations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"plan" jsonb NOT NULL,
	"plan_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "recreio_rights_preparation_identity" UNIQUE("id","requester_user_id","plan_sha256"),
	CONSTRAINT "recreio_rights_preparation_kind" CHECK ("recreio"."rights_preparations"."kind" in ('retirar_perfil','encerrar_conta')),
	CONSTRAINT "recreio_rights_preparation_version" CHECK ("recreio"."rights_preparations"."version"=1),
	CONSTRAINT "recreio_rights_preparation_sha" CHECK ("recreio"."rights_preparations"."plan_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "recreio_rights_preparation_plan" CHECK (jsonb_typeof("recreio"."rights_preparations"."plan")='object' and pg_column_size("recreio"."rights_preparations"."plan") between 2 and 262144),
	CONSTRAINT "recreio_rights_preparation_time" CHECK ("recreio"."rights_preparations"."expires_at">"recreio"."rights_preparations"."created_at" and "recreio"."rights_preparations"."expires_at"<="recreio"."rights_preparations"."created_at"+interval '30 minutes' and ("recreio"."rights_preparations"."cancelled_at" is null or "recreio"."rights_preparations"."cancelled_at">="recreio"."rights_preparations"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "recreio"."rights_preparations" ADD CONSTRAINT "rights_preparations_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_rights_preparation_account" ON "recreio"."rights_preparations" USING btree ("requester_user_id","created_at","id");