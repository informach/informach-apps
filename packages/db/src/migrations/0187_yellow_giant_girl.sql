CREATE TABLE "recreio"."safety_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_profile_id" uuid,
	"target_profile_id" uuid,
	"actor_user_id" text,
	"actor_kind" text NOT NULL,
	"client_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"category" text NOT NULL,
	"priority" boolean NOT NULL,
	"evidence_kind" text NOT NULL,
	"evidence_id" uuid,
	"evidence_revision" integer,
	"state" text DEFAULT 'aberta' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_safety_report_actor" CHECK ("recreio"."safety_reports"."actor_kind" in ('jogador','responsavel')),
	CONSTRAINT "recreio_safety_report_category" CHECK ("recreio"."safety_reports"."category" in ('contato_indesejado','assedio','conteudo_inadequado','dados_pessoais','ameaca','outro')),
	CONSTRAINT "recreio_safety_report_state" CHECK ("recreio"."safety_reports"."state" in ('aberta','em_analise','resolvida','recurso','encerrada')),
	CONSTRAINT "recreio_safety_report_evidence" CHECK (("recreio"."safety_reports"."evidence_kind"='pedido' and "recreio"."safety_reports"."evidence_id" is not null and "recreio"."safety_reports"."evidence_revision" is null) or ("recreio"."safety_reports"."evidence_kind"='amizade' and "recreio"."safety_reports"."evidence_revision" is not null and "recreio"."safety_reports"."evidence_revision">0 and "recreio"."safety_reports"."evidence_id" is null) or ("recreio"."safety_reports"."evidence_kind"='protecao' and "recreio"."safety_reports"."evidence_id" is null and "recreio"."safety_reports"."evidence_revision" is null)),
	CONSTRAINT "recreio_safety_report_distinct" CHECK ("recreio"."safety_reports"."reporter_profile_id" is null or "recreio"."safety_reports"."target_profile_id" is null or "recreio"."safety_reports"."reporter_profile_id"<>"recreio"."safety_reports"."target_profile_id"),
	CONSTRAINT "recreio_safety_report_digest" CHECK ("recreio"."safety_reports"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_safety_report_revision" CHECK ("recreio"."safety_reports"."revision">0),
	CONSTRAINT "recreio_safety_report_dates" CHECK ("recreio"."safety_reports"."updated_at">="recreio"."safety_reports"."created_at" and "recreio"."safety_reports"."expires_at">"recreio"."safety_reports"."created_at" and "recreio"."safety_reports"."expires_at"<="recreio"."safety_reports"."created_at"+interval '180 days' and ("recreio"."safety_reports"."closed_at" is null or ("recreio"."safety_reports"."closed_at">="recreio"."safety_reports"."created_at" and "recreio"."safety_reports"."expires_at"<="recreio"."safety_reports"."closed_at"+interval '90 days'))),
	CONSTRAINT "recreio_safety_report_closed" CHECK (("recreio"."safety_reports"."state"='encerrada')=("recreio"."safety_reports"."closed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD CONSTRAINT "safety_reports_reporter_profile_id_profiles_id_fk" FOREIGN KEY ("reporter_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD CONSTRAINT "safety_reports_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."safety_reports" ADD CONSTRAINT "safety_reports_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_safety_report_retry" ON "recreio"."safety_reports" USING btree ("reporter_profile_id","client_key");--> statement-breakpoint
CREATE INDEX "recreio_safety_report_queue" ON "recreio"."safety_reports" USING btree ("state","priority","created_at","id");--> statement-breakpoint
CREATE INDEX "recreio_safety_report_retention" ON "recreio"."safety_reports" USING btree ("expires_at","id");--> statement-breakpoint
CREATE INDEX "recreio_safety_report_target" ON "recreio"."safety_reports" USING btree ("target_profile_id","created_at");