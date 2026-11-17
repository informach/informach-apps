ALTER TABLE "core"."sessions" ADD COLUMN "origin_app" text;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD COLUMN "parent_session_id" text;--> statement-breakpoint
CREATE INDEX "sessions_parent_idx" ON "core"."sessions" USING btree ("parent_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_id_user_uniq" ON "core"."sessions" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_parent_owner_fk" FOREIGN KEY ("parent_session_id","user_id") REFERENCES "core"."sessions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_parent_not_self" CHECK ("core"."sessions"."parent_session_id" is null or "core"."sessions"."parent_session_id" <> "core"."sessions"."id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_web_lineage" CHECK ((
      ("core"."sessions"."origin_app" is null and "core"."sessions"."parent_session_id" is null)
      or ("core"."sessions"."origin_app" = 'conta' and "core"."sessions"."parent_session_id" is null)
      or ("core"."sessions"."origin_app" is not null and length("core"."sessions"."origin_app") > 0 and "core"."sessions"."origin_app" <> 'conta' and "core"."sessions"."parent_session_id" is not null)
    ));
