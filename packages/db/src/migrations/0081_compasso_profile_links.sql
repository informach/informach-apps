ALTER TABLE "family"."people" DROP CONSTRAINT "family_person_kind";--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" ADD COLUMN "family_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD COLUMN "family_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" ADD COLUMN "family_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD COLUMN "family_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" ADD CONSTRAINT "student_profiles_family_profile_id_app_profiles_id_fk" FOREIGN KEY ("family_profile_id") REFERENCES "family"."app_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD CONSTRAINT "profiles_family_profile_id_app_profiles_id_fk" FOREIGN KEY ("family_profile_id") REFERENCES "family"."app_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" ADD CONSTRAINT "children_family_profile_id_app_profiles_id_fk" FOREIGN KEY ("family_profile_id") REFERENCES "family"."app_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD CONSTRAINT "profiles_family_profile_id_app_profiles_id_fk" FOREIGN KEY ("family_profile_id") REFERENCES "family"."app_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" ADD CONSTRAINT "student_profiles_family_profile_id_unique" UNIQUE("family_profile_id");--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD CONSTRAINT "profiles_family_profile_id_unique" UNIQUE("family_profile_id");--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" ADD CONSTRAINT "children_family_profile_id_unique" UNIQUE("family_profile_id");--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD CONSTRAINT "profiles_family_profile_id_unique" UNIQUE("family_profile_id");--> statement-breakpoint
ALTER TABLE "family"."people" ADD CONSTRAINT "family_person_kind" CHECK ("family"."people"."kind" in ('adult', 'dependent', 'unclassified'));