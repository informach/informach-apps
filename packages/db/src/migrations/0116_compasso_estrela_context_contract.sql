ALTER TABLE "dia_de_estrela"."guardian_invitations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."guardians" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "dia_de_estrela"."guardian_invitations" RESTRICT;--> statement-breakpoint
DROP TABLE "dia_de_estrela"."guardians" RESTRICT;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" DROP CONSTRAINT "families_family_group_id_unique";--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" DROP CONSTRAINT "estrela_children_name";--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" DROP CONSTRAINT "estrela_children_color";--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" DROP CONSTRAINT "children_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."devices" DROP CONSTRAINT "devices_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" DROP CONSTRAINT "families_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."rewards" DROP CONSTRAINT "rewards_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" ALTER COLUMN "family_profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."device_children" ALTER COLUMN "delegation_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."device_children" ALTER COLUMN "read_grant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."device_children" ALTER COLUMN "write_grant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."devices" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
-- Drizzle 0.31.11 leaves PK removal as a manual placeholder. Resolve only the
-- expected historical user_id PK; any drift aborts rather than dropping an unknown key.
DO $$ DECLARE previous record;
BEGIN
  SELECT conname, pg_get_constraintdef(oid) AS definition INTO previous
  FROM pg_constraint WHERE conrelid = 'dia_de_estrela.families'::regclass AND contype = 'p';
  IF previous.conname IS NULL OR previous.definition <> 'PRIMARY KEY (user_id)' THEN
    RAISE EXCEPTION 'Compasso Estrela: unexpected historical family primary key';
  END IF;
  EXECUTE format('ALTER TABLE dia_de_estrela.families DROP CONSTRAINT %I', previous.conname);
END $$;
--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ADD PRIMARY KEY ("family_group_id");--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."rewards" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."rewards" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" ADD CONSTRAINT "children_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ADD CONSTRAINT "families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."rewards" ADD CONSTRAINT "rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" DROP COLUMN "color";