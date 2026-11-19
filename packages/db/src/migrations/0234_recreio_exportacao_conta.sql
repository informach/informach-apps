ALTER TABLE "recreio"."personal_exports" DROP CONSTRAINT "recreio_personal_export_profile";--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ALTER COLUMN "profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ALTER COLUMN "profile_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ALTER COLUMN "policy_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ADD COLUMN "scope" text DEFAULT 'profile' NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."personal_exports" ADD CONSTRAINT "recreio_personal_export_profile" CHECK (((
        "recreio"."personal_exports"."scope"='profile' and "recreio"."personal_exports"."profile_id" is not null and "recreio"."personal_exports"."policy_version">0 and
        (("recreio"."personal_exports"."profile_kind"='adult' and "recreio"."personal_exports"."guardian_reference" is null) or ("recreio"."personal_exports"."profile_kind"='minor' and "recreio"."personal_exports"."guardian_reference" is not null))
      ) or (
        "recreio"."personal_exports"."scope"='account' and "recreio"."personal_exports"."profile_id" is null and "recreio"."personal_exports"."profile_kind" is null and "recreio"."personal_exports"."policy_version" is null and "recreio"."personal_exports"."guardian_reference" is null
      )) is true);