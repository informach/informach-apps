CREATE TABLE "recreio"."profile_restrictions" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"source_report_id" uuid,
	"moderator_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "recreio_profile_restriction_revision" CHECK ("recreio"."profile_restrictions"."revision">0),
	CONSTRAINT "recreio_profile_restriction_state" CHECK ("recreio"."profile_restrictions"."state" in ('suspended','released')),
	CONSTRAINT "recreio_profile_restriction_reason" CHECK ("recreio"."profile_restrictions"."reason" in ('risco_confirmado','medida_preventiva','recurso_procedente','correcao_operacional','legado_sem_recibo')),
	CONSTRAINT "recreio_profile_restriction_dates" CHECK ("recreio"."profile_restrictions"."updated_at">="recreio"."profile_restrictions"."created_at" and ("recreio"."profile_restrictions"."released_at" is null or ("recreio"."profile_restrictions"."released_at">="recreio"."profile_restrictions"."created_at" and "recreio"."profile_restrictions"."released_at"<="recreio"."profile_restrictions"."updated_at"))),
	CONSTRAINT "recreio_profile_restriction_released" CHECK (("recreio"."profile_restrictions"."state"='released')=("recreio"."profile_restrictions"."released_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "recreio"."restriction_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"restriction_revision" integer NOT NULL,
	"client_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"actor_user_id" text,
	"actor_kind" text NOT NULL,
	"state" text DEFAULT 'aberto' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_restriction_review_revision" CHECK ("recreio"."restriction_reviews"."revision">0 and "recreio"."restriction_reviews"."restriction_revision">0),
	CONSTRAINT "recreio_restriction_review_actor" CHECK ("recreio"."restriction_reviews"."actor_kind" in ('titular','responsavel')),
	CONSTRAINT "recreio_restriction_review_digest" CHECK ("recreio"."restriction_reviews"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_restriction_review_state" CHECK ("recreio"."restriction_reviews"."state" in ('aberto','resolvido')),
	CONSTRAINT "recreio_restriction_review_decision" CHECK (("recreio"."restriction_reviews"."state"='aberto' and "recreio"."restriction_reviews"."decision" is null and "recreio"."restriction_reviews"."resolved_at" is null) or ("recreio"."restriction_reviews"."state"='resolvido' and "recreio"."restriction_reviews"."decision" is not null and "recreio"."restriction_reviews"."decision" in ('manter','reativar') and "recreio"."restriction_reviews"."resolved_at" is not null)),
	CONSTRAINT "recreio_restriction_review_dates" CHECK ("recreio"."restriction_reviews"."expires_at">"recreio"."restriction_reviews"."created_at" and "recreio"."restriction_reviews"."expires_at"<="recreio"."restriction_reviews"."created_at"+interval '180 days' and ("recreio"."restriction_reviews"."resolved_at" is null or ("recreio"."restriction_reviews"."resolved_at">="recreio"."restriction_reviews"."created_at" and "recreio"."restriction_reviews"."resolved_at"<"recreio"."restriction_reviews"."expires_at" and "recreio"."restriction_reviews"."expires_at"<="recreio"."restriction_reviews"."resolved_at"+interval '90 days')))
);
--> statement-breakpoint
ALTER TABLE "recreio"."moderation_commands" DROP CONSTRAINT "recreio_moderation_command_operation";--> statement-breakpoint
ALTER TABLE "recreio"."moderation_commands" ADD COLUMN "restriction_review_id" uuid;--> statement-breakpoint
ALTER TABLE "recreio"."moderation_commands" ADD COLUMN "case_kind" text DEFAULT 'denuncia' NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."profile_restrictions" ADD CONSTRAINT "profile_restrictions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profile_restrictions" ADD CONSTRAINT "profile_restrictions_source_report_id_safety_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "recreio"."safety_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profile_restrictions" ADD CONSTRAINT "profile_restrictions_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."restriction_reviews" ADD CONSTRAINT "restriction_reviews_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."restriction_reviews" ADD CONSTRAINT "restriction_reviews_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_profile_restriction_retention" ON "recreio"."profile_restrictions" USING btree ("released_at","profile_id") WHERE "recreio"."profile_restrictions"."state"='released';--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_restriction_review_retry" ON "recreio"."restriction_reviews" USING btree ("profile_id","client_key");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_restriction_review_actor" ON "recreio"."restriction_reviews" USING btree ("profile_id","restriction_revision","actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_restriction_review_open" ON "recreio"."restriction_reviews" USING btree ("profile_id","restriction_revision") WHERE "recreio"."restriction_reviews"."state"='aberto';--> statement-breakpoint
CREATE INDEX "recreio_restriction_review_queue" ON "recreio"."restriction_reviews" USING btree ("state","created_at","id");--> statement-breakpoint
CREATE INDEX "recreio_restriction_review_retention" ON "recreio"."restriction_reviews" USING btree ("expires_at","id");--> statement-breakpoint
ALTER TABLE "recreio"."moderation_commands" ADD CONSTRAINT "moderation_commands_restriction_review_id_restriction_reviews_id_fk" FOREIGN KEY ("restriction_review_id") REFERENCES "recreio"."restriction_reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."moderation_commands" ADD CONSTRAINT "recreio_moderation_command_case" CHECK (("recreio"."moderation_commands"."case_kind"='denuncia' and "recreio"."moderation_commands"."restriction_review_id" is null and "recreio"."moderation_commands"."operation"<>'responder_recurso') or ("recreio"."moderation_commands"."case_kind"='recurso_restricao' and "recreio"."moderation_commands"."report_id" is null and "recreio"."moderation_commands"."operation"='responder_recurso'));--> statement-breakpoint
ALTER TABLE "recreio"."moderation_commands" ADD CONSTRAINT "recreio_moderation_command_operation" CHECK ("recreio"."moderation_commands"."operation" in ('analisar','concluir','suspender_perfil','reativar_perfil','desfazer_amizade','invalidar_convite','responder_recurso'));