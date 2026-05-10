CREATE TABLE "agenda"."cities" (
	"ibge_code" text PRIMARY KEY NOT NULL,
	"state_uf" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."schools" (
	"inep_code" text PRIMARY KEY NOT NULL,
	"city_ibge_code" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."states" (
	"uf" text PRIMARY KEY NOT NULL,
	"ibge_code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "states_ibge_code_unique" UNIQUE("ibge_code")
);
--> statement-breakpoint
CREATE TABLE "agenda"."turma_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turma_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."turmas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"school_inep_code" text NOT NULL,
	"grade" text NOT NULL,
	"year" integer NOT NULL,
	"class_letter" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turmas_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" ADD COLUMN "active_turma_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."cities" ADD CONSTRAINT "cities_state_uf_states_uf_fk" FOREIGN KEY ("state_uf") REFERENCES "agenda"."states"("uf") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."schools" ADD CONSTRAINT "schools_city_ibge_code_cities_ibge_code_fk" FOREIGN KEY ("city_ibge_code") REFERENCES "agenda"."cities"("ibge_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."turma_members" ADD CONSTRAINT "turma_members_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "agenda"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."turma_members" ADD CONSTRAINT "turma_members_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."turmas" ADD CONSTRAINT "turmas_school_inep_code_schools_inep_code_fk" FOREIGN KEY ("school_inep_code") REFERENCES "agenda"."schools"("inep_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."turmas" ADD CONSTRAINT "turmas_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_cities_state_name_idx" ON "agenda"."cities" USING btree ("state_uf","name");--> statement-breakpoint
CREATE INDEX "agenda_schools_city_name_idx" ON "agenda"."schools" USING btree ("city_ibge_code","name");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_turma_members_unique_idx" ON "agenda"."turma_members" USING btree ("turma_id","student_profile_id");--> statement-breakpoint
CREATE INDEX "agenda_turma_members_profile_idx" ON "agenda"."turma_members" USING btree ("student_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_turmas_natural_key_idx" ON "agenda"."turmas" USING btree ("school_inep_code","grade","year","class_letter");--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" ADD CONSTRAINT "student_profiles_active_turma_id_turmas_id_fk" FOREIGN KEY ("active_turma_id") REFERENCES "agenda"."turmas"("id") ON DELETE set null ON UPDATE no action;