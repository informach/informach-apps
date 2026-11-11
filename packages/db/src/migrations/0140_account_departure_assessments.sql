CREATE SCHEMA "account";
--> statement-breakpoint
CREATE TABLE "account"."departure_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"app" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"result" jsonb,
	"observed_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "account_departure_assessment_app_length" CHECK (length("account"."departure_assessments"."app") between 1 and 80),
	CONSTRAINT "account_departure_assessment_attempts" CHECK ("account"."departure_assessments"."attempts" >= 0),
	CONSTRAINT "account_departure_assessment_error" CHECK ("account"."departure_assessments"."last_error" = 'assessment_failed'),
	CONSTRAINT "account_departure_assessment_state" CHECK ((
        ("account"."departure_assessments"."state" = 'queued' and "account"."departure_assessments"."lease_token" is null and "account"."departure_assessments"."lease_until" is null and "account"."departure_assessments"."result" is null and "account"."departure_assessments"."observed_at" is null)
        or ("account"."departure_assessments"."state" = 'running' and "account"."departure_assessments"."lease_token" is not null and "account"."departure_assessments"."lease_until" is not null and "account"."departure_assessments"."result" is null and "account"."departure_assessments"."observed_at" is null)
        or ("account"."departure_assessments"."state" = 'done' and "account"."departure_assessments"."lease_token" is null and "account"."departure_assessments"."lease_until" is null and "account"."departure_assessments"."result" is not null and "account"."departure_assessments"."observed_at" is not null)
      )),
	CONSTRAINT "account_departure_assessment_result" CHECK ("account"."departure_assessments"."result" is null or (jsonb_typeof("account"."departure_assessments"."result") = 'object' and octet_length("account"."departure_assessments"."result"::text) <= 1024))
);
--> statement-breakpoint
CREATE TABLE "account"."departure_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"scope" text DEFAULT 'compasso-web' NOT NULL,
	"state" text DEFAULT 'collecting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_departure_review_scope" CHECK ("account"."departure_reviews"."scope" = 'compasso-web'),
	CONSTRAINT "account_departure_review_state" CHECK ("account"."departure_reviews"."state" in ('collecting', 'ready', 'cancelled')),
	CONSTRAINT "account_departure_review_expiry" CHECK ("account"."departure_reviews"."expires_at" > "account"."departure_reviews"."created_at")
);
--> statement-breakpoint
ALTER TABLE "account"."departure_assessments" ADD CONSTRAINT "departure_assessments_review_id_departure_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "account"."departure_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account"."departure_reviews" ADD CONSTRAINT "departure_reviews_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_departure_assessment_app" ON "account"."departure_assessments" USING btree ("review_id","app");--> statement-breakpoint
CREATE INDEX "account_departure_assessment_due" ON "account"."departure_assessments" USING btree ("app","available_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_departure_review_active" ON "account"."departure_reviews" USING btree ("actor_id") WHERE "account"."departure_reviews"."state" <> 'cancelled';