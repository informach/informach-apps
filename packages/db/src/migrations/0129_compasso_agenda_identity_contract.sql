ALTER TABLE "agenda"."family_invitations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agenda"."family_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agenda"."family_profile_access" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agenda"."family_invitations" CASCADE;--> statement-breakpoint
DROP TABLE "agenda"."family_members" CASCADE;--> statement-breakpoint
DROP TABLE "agenda"."family_profile_access" CASCADE;--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" DROP CONSTRAINT "student_profiles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."notices" DROP CONSTRAINT "notices_owner_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "agenda"."agenda_student_profiles_user_created_idx";--> statement-breakpoint
DROP INDEX "agenda"."agenda_notices_owner_created_idx";--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" ALTER COLUMN "family_profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "agenda_notices_family_created_idx" ON "agenda"."notices" USING btree ("family_group_id","created_at");--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "agenda"."student_profiles" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "agenda"."notices" DROP COLUMN "owner_user_id";