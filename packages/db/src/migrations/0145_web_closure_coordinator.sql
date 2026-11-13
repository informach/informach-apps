CREATE TABLE "account"."web_closure_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"closure_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"phase" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"plan" jsonb,
	"completed_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "account_web_closure_step_domain" CHECK ("account"."web_closure_steps"."domain" in ('family','billing') or "account"."web_closure_steps"."domain" ~ '^app:[a-z0-9][a-z0-9-]{0,79}$'),
	CONSTRAINT "account_web_closure_step_phase" CHECK ("account"."web_closure_steps"."phase" in ('prepare','erase','resume')),
	CONSTRAINT "account_web_closure_step_attempts" CHECK ("account"."web_closure_steps"."attempts" >= 0),
	CONSTRAINT "account_web_closure_step_error" CHECK ("account"."web_closure_steps"."last_error" in ('step_failed','scope_changed')),
	CONSTRAINT "account_web_closure_step_state" CHECK ((
    ("account"."web_closure_steps"."state" = 'queued' and "account"."web_closure_steps"."lease_token" is null and "account"."web_closure_steps"."lease_until" is null and "account"."web_closure_steps"."completed_at" is null)
    or ("account"."web_closure_steps"."state" = 'running' and "account"."web_closure_steps"."lease_token" is not null and "account"."web_closure_steps"."lease_until" is not null and "account"."web_closure_steps"."completed_at" is null)
    or ("account"."web_closure_steps"."state" = 'done' and "account"."web_closure_steps"."lease_token" is null and "account"."web_closure_steps"."lease_until" is null and "account"."web_closure_steps"."completed_at" is not null)
    or ("account"."web_closure_steps"."state" = 'cancelled' and "account"."web_closure_steps"."lease_token" is null and "account"."web_closure_steps"."lease_until" is null and "account"."web_closure_steps"."completed_at" is not null)
  )),
	CONSTRAINT "account_web_closure_step_plan" CHECK ((
    ("account"."web_closure_steps"."phase" = 'prepare' and "account"."web_closure_steps"."state" = 'done' and "account"."web_closure_steps"."plan" is not null)
    or (("account"."web_closure_steps"."phase" <> 'prepare' or "account"."web_closure_steps"."state" <> 'done') and "account"."web_closure_steps"."plan" is null)
  ) and ("account"."web_closure_steps"."plan" is null or (jsonb_typeof("account"."web_closure_steps"."plan") = 'object' and octet_length("account"."web_closure_steps"."plan"::text) <= 2048)))
);
--> statement-breakpoint
CREATE TABLE "account"."web_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"scope" text DEFAULT 'compasso-web' NOT NULL,
	"source_review_id" uuid NOT NULL,
	"catalog" jsonb NOT NULL,
	"frozen_revision" integer NOT NULL,
	"state" text DEFAULT 'preparing' NOT NULL,
	"consent_digest" text,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_web_closure_scope" CHECK ("account"."web_closures"."scope" = 'compasso-web'),
	CONSTRAINT "account_web_closure_revision" CHECK ("account"."web_closures"."frozen_revision" > 0),
	CONSTRAINT "account_web_closure_catalog" CHECK (jsonb_typeof("account"."web_closures"."catalog") = 'array' and jsonb_array_length("account"."web_closures"."catalog") between 1 and 64 and octet_length("account"."web_closures"."catalog"::text) <= 8192),
	CONSTRAINT "account_web_closure_state" CHECK ("account"."web_closures"."state" in ('preparing','ready','executing','finalizing','resuming','completed','cancelled')),
	CONSTRAINT "account_web_closure_consent" CHECK ((
    ("account"."web_closures"."state" in ('preparing','ready','resuming','cancelled') and "account"."web_closures"."consent_digest" is null and "account"."web_closures"."confirmed_at" is null)
    or ("account"."web_closures"."state" in ('executing','finalizing','completed') and "account"."web_closures"."consent_digest" is not null and "account"."web_closures"."consent_digest" ~ '^[a-f0-9]{64}$' and "account"."web_closures"."confirmed_at" is not null)
  )),
	CONSTRAINT "account_web_closure_completion" CHECK (("account"."web_closures"."completed_at" is not null) = ("account"."web_closures"."state" in ('completed','cancelled')))
);
--> statement-breakpoint
ALTER TABLE "account"."web_closure_steps" ADD CONSTRAINT "web_closure_steps_closure_id_web_closures_id_fk" FOREIGN KEY ("closure_id") REFERENCES "account"."web_closures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account"."web_closures" ADD CONSTRAINT "web_closures_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_web_closure_step_phase" ON "account"."web_closure_steps" USING btree ("closure_id","domain","phase");--> statement-breakpoint
CREATE INDEX "account_web_closure_step_due" ON "account"."web_closure_steps" USING btree ("domain","available_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_web_closure_actor" ON "account"."web_closures" USING btree ("actor_id") WHERE "account"."web_closures"."state" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "account_web_closure_finalization" ON "account"."web_closures" USING btree ("state","created_at","id");