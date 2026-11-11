/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'agenda'
                AND table_name = 'notification_preferences'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "notification_preferences" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_notification_family_user_idx" ON "agenda"."notification_preferences" USING btree ("family_group_id","user_id");