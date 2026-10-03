CREATE TABLE "missao_saber"."study_access_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."study_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."study_device_profiles" (
	"device_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	CONSTRAINT "study_device_profiles_device_id_profile_id_pk" PRIMARY KEY("device_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."study_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"remember" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missao_study_label_length" CHECK (length("missao_saber"."study_devices"."label") between 2 and 60)
);
--> statement-breakpoint
ALTER TABLE "missao_saber"."study_codes" ADD CONSTRAINT "study_codes_device_id_study_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "missao_saber"."study_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_device_profiles" ADD CONSTRAINT "study_device_profiles_device_id_study_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "missao_saber"."study_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_device_profiles" ADD CONSTRAINT "study_device_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "missao_saber"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_devices" ADD CONSTRAINT "study_devices_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "missao_saber"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "missao_study_code_hash" ON "missao_saber"."study_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "missao_study_code_expiry" ON "missao_saber"."study_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "missao_study_profile_device" ON "missao_saber"."study_device_profiles" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "missao_study_token_hash" ON "missao_saber"."study_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "missao_study_device_owner" ON "missao_saber"."study_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "missao_study_device_expiry" ON "missao_saber"."study_devices" USING btree ("expires_at");