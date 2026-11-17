ALTER TABLE "recreio"."groups" DROP CONSTRAINT "groups_owner_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "recreio"."profiles" DROP CONSTRAINT "profiles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "recreio"."groups" ADD CONSTRAINT "groups_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;