CREATE TABLE "cozya"."ai_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"response" jsonb,
	"status_code" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cozya"."ai_operations" ADD CONSTRAINT "ai_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cozya_ai_operations_expiry_idx" ON "cozya"."ai_operations" USING btree ("expires_at");