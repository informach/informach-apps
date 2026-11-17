CREATE TABLE "recreio"."adult_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_declaration_version" UNIQUE("user_id","version"),
	CONSTRAINT "recreio_declaration_identity" UNIQUE("id","user_id"),
	CONSTRAINT "recreio_declaration_version_format" CHECK ("recreio"."adult_declarations"."version" ~ '^responsabilidade-[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "recreio"."guardian_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"guardian_user_id" text NOT NULL,
	"declaration_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_guardian_profile" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "recreio"."minor_profiles" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'minor' NOT NULL,
	"birth_month" integer NOT NULL,
	"birth_year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_minor_kind" CHECK ("recreio"."minor_profiles"."kind" = 'minor'),
	CONSTRAINT "recreio_minor_birth_month" CHECK ("recreio"."minor_profiles"."birth_month" between 1 and 12),
	CONSTRAINT "recreio_minor_birth_year" CHECK ("recreio"."minor_profiles"."birth_year" between 1900 and 9999)
);
--> statement-breakpoint
CREATE TABLE "recreio"."profile_creation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" uuid,
	"fingerprint" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_profile_creation_receipt" CHECK (("recreio"."profile_creation_requests"."consumed_at" is null and "recreio"."profile_creation_requests"."profile_id" is null and "recreio"."profile_creation_requests"."fingerprint" is null) or ("recreio"."profile_creation_requests"."consumed_at" is not null and "recreio"."profile_creation_requests"."fingerprint" is not null and "recreio"."profile_creation_requests"."fingerprint" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "recreio_profile_creation_expiry" CHECK ("recreio"."profile_creation_requests"."expires_at" > "recreio"."profile_creation_requests"."created_at")
);
--> statement-breakpoint
ALTER TABLE "recreio"."adult_declarations" ADD CONSTRAINT "adult_declarations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."guardian_links" ADD CONSTRAINT "guardian_links_profile_id_minor_profiles_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."minor_profiles"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."guardian_links" ADD CONSTRAINT "recreio_guardian_declaration" FOREIGN KEY ("declaration_id","guardian_user_id") REFERENCES "recreio"."adult_declarations"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."minor_profiles" ADD CONSTRAINT "recreio_minor_profile_kind" FOREIGN KEY ("profile_id","kind") REFERENCES "recreio"."profiles"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profile_creation_requests" ADD CONSTRAINT "profile_creation_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profile_creation_requests" ADD CONSTRAINT "profile_creation_requests_profile_id_minor_profiles_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."minor_profiles"("profile_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_guardian_user" ON "recreio"."guardian_links" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE INDEX "recreio_profile_creation_user" ON "recreio"."profile_creation_requests" USING btree ("user_id","created_at");