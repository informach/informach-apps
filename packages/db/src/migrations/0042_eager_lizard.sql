CREATE TABLE "billing"."checkout_intents" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"request_started" boolean DEFAULT false NOT NULL,
	"provider_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."checkout_intents" ADD CONSTRAINT "checkout_intents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."checkout_intents" ADD CONSTRAINT "checkout_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;