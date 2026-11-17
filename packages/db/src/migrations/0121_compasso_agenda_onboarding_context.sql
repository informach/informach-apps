ALTER TABLE "agenda"."family_settings" DROP CONSTRAINT "family_settings_family_group_id_unique";--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'agenda'
                AND table_name = 'family_settings'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "family_settings" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "agenda"."family_settings" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."family_settings" ADD CONSTRAINT "family_settings_family_group_id_user_id_pk" PRIMARY KEY("family_group_id","user_id");