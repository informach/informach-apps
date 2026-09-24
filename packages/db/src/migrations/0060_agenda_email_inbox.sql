CREATE TABLE "agenda"."inbox_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"from_hash" text NOT NULL,
	"from_domain" text,
	"subject" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"attachment_name" text,
	"attachment_type" text,
	"attachment_data" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notice_id" uuid,
	CONSTRAINT "agenda_inbox_message_status_check" CHECK ("agenda"."inbox_messages"."status" IN ('new','used','discarded'))
);
--> statement-breakpoint
ALTER TABLE "agenda"."inbox_addresses" ADD CONSTRAINT "inbox_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."inbox_messages" ADD CONSTRAINT "inbox_messages_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."inbox_messages" ADD CONSTRAINT "inbox_messages_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "agenda"."notices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_inbox_token_idx" ON "agenda"."inbox_addresses" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_inbox_active_user_idx" ON "agenda"."inbox_addresses" USING btree ("user_id") WHERE "agenda"."inbox_addresses"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "agenda_inbox_messages_owner_status_idx" ON "agenda"."inbox_messages" USING btree ("owner_user_id","status","received_at");--> statement-breakpoint
CREATE INDEX "agenda_inbox_messages_expiry_idx" ON "agenda"."inbox_messages" USING btree ("expires_at");