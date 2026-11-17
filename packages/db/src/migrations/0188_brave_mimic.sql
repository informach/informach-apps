CREATE TABLE "recreio"."moderation_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid,
	"moderator_user_id" text,
	"request_hash" text NOT NULL,
	"operation" text NOT NULL,
	"report_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_moderation_command_operation" CHECK ("recreio"."moderation_commands"."operation" in ('analisar','concluir','suspender_perfil','reativar_perfil','desfazer_amizade','invalidar_convite')),
	CONSTRAINT "recreio_moderation_command_digest" CHECK ("recreio"."moderation_commands"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_moderation_command_revision" CHECK ("recreio"."moderation_commands"."report_revision">1),
	CONSTRAINT "recreio_moderation_command_dates" CHECK ("recreio"."moderation_commands"."expires_at">"recreio"."moderation_commands"."created_at" and "recreio"."moderation_commands"."expires_at"<="recreio"."moderation_commands"."created_at"+interval '180 days')
);
--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD COLUMN "review_client_key" uuid;--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD COLUMN "review_revision" integer;--> statement-breakpoint
ALTER TABLE "recreio"."moderation_commands" ADD CONSTRAINT "moderation_commands_report_id_safety_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "recreio"."safety_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."moderation_commands" ADD CONSTRAINT "moderation_commands_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_moderation_command_retention" ON "recreio"."moderation_commands" USING btree ("expires_at","id");--> statement-breakpoint
CREATE INDEX "recreio_moderation_command_report" ON "recreio"."moderation_commands" USING btree ("report_id","created_at");--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD CONSTRAINT "recreio_safety_report_decision" CHECK ("recreio"."safety_reports"."decision" is null or "recreio"."safety_reports"."decision" in ('sem_elementos','medida_aplicada','duplicada'));--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD CONSTRAINT "recreio_safety_report_review" CHECK (("recreio"."safety_reports"."review_requested_at" is null and "recreio"."safety_reports"."review_client_key" is null and "recreio"."safety_reports"."review_revision" is null) or ("recreio"."safety_reports"."review_requested_at" is not null and "recreio"."safety_reports"."review_client_key" is not null and "recreio"."safety_reports"."review_revision" is not null and "recreio"."safety_reports"."review_revision">1 and "recreio"."safety_reports"."review_revision"<="recreio"."safety_reports"."revision" and "recreio"."safety_reports"."review_requested_at">="recreio"."safety_reports"."created_at" and "recreio"."safety_reports"."review_requested_at"<"recreio"."safety_reports"."expires_at"));--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD CONSTRAINT "recreio_safety_report_review_state" CHECK ("recreio"."safety_reports"."state"<>'recurso' or "recreio"."safety_reports"."review_requested_at" is not null);