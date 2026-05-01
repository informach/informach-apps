CREATE TABLE "core"."email_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"category" text NOT NULL,
	"message_key" text NOT NULL,
	"subject" text NOT NULL,
	"provider" text DEFAULT 'sendgrid' NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_accepted" boolean DEFAULT false NOT NULL,
	"send_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sending_started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."email_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'sendgrid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."email_unsubscribes" (
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"unsubscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_unsubscribes_user_id_category_pk" PRIMARY KEY("user_id","category")
);
--> statement-breakpoint
CREATE TABLE "core"."rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_request" bigint
);
--> statement-breakpoint
ALTER TABLE "audit"."events" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "audit"."events" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "audit"."events" ALTER COLUMN "actor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "core"."email_unsubscribes" ADD CONSTRAINT "email_unsubscribes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_category_key_uniq" ON "core"."email_deliveries" USING btree ("category","message_key");--> statement-breakpoint
CREATE INDEX "email_deliveries_status_next_attempt_idx" ON "core"."email_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_sending_started_idx" ON "core"."email_deliveries" USING btree ("sending_started_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_provider_message_id_idx" ON "core"."email_deliveries" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "rate_limit_key_idx" ON "core"."rate_limit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "events_event_type_idx" ON "audit"."events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "events_actor_created_idx" ON "audit"."events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "core"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "core"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "core"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "core"."verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verifications_expires_at_idx" ON "core"."verifications" USING btree ("expires_at");