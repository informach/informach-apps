CREATE SCHEMA "ops";
--> statement-breakpoint
CREATE TABLE "ops"."job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app" text NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_name" text
);
--> statement-breakpoint
CREATE TABLE "ops"."service_status" (
	"service" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"latency_ms" integer,
	"commit" text,
	"detail" text,
	"alerted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "job_runs_app_job_started_idx" ON "ops"."job_runs" USING btree ("app","job","started_at");