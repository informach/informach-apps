CREATE TABLE "agenda"."idempotent_writes" (
	"key" uuid NOT NULL,
	"user_id" text NOT NULL,
	"task_id" uuid,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotent_writes_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "agenda"."idempotent_writes" ADD CONSTRAINT "idempotent_writes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_idempotent_write_age_idx" ON "agenda"."idempotent_writes" USING btree ("created_at");