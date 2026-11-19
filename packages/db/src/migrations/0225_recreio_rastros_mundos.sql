CREATE TABLE "recreio"."profile_world_traces" (
	"profile_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"first_recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_profile_world_trace" PRIMARY KEY("profile_id","space_id")
);
--> statement-breakpoint
ALTER TABLE "recreio"."profile_world_traces" ADD CONSTRAINT "profile_world_traces_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profile_world_traces" ADD CONSTRAINT "profile_world_traces_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_world_profile_trace" ON "recreio"."profile_world_traces" USING btree ("space_id","profile_id");