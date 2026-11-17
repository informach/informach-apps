ALTER TABLE "dia_de_estrela"."device_children" ADD COLUMN "delegation_key" uuid;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."device_children" ADD COLUMN "read_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."device_children" ADD COLUMN "write_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."devices" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ADD COLUMN "pin_generation" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."rewards" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."devices" ADD CONSTRAINT "devices_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ADD CONSTRAINT "families_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."rewards" ADD CONSTRAINT "rewards_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ADD CONSTRAINT "families_family_group_id_unique" UNIQUE("family_group_id");