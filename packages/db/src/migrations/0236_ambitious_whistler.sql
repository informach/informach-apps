CREATE TABLE "recreio"."account_participations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"revision" integer NOT NULL,
	"operation_id" uuid,
	"operation_kind" text DEFAULT 'encerrar_conta' NOT NULL,
	"closing_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_account_participation_operation" UNIQUE("operation_id"),
	CONSTRAINT "recreio_account_participation_kind" CHECK ("recreio"."account_participations"."operation_kind"='encerrar_conta'),
	CONSTRAINT "recreio_account_participation_state" CHECK (((
        "recreio"."account_participations"."state"='active' and "recreio"."account_participations"."revision"=1 and "recreio"."account_participations"."operation_id" is null and
        "recreio"."account_participations"."closing_at" is null and "recreio"."account_participations"."closed_at" is null
      ) or (
        "recreio"."account_participations"."state"='closing' and "recreio"."account_participations"."revision"=2 and "recreio"."account_participations"."operation_id" is not null and
        "recreio"."account_participations"."closing_at" is not null and "recreio"."account_participations"."closed_at" is null and "recreio"."account_participations"."updated_at">="recreio"."account_participations"."closing_at"
      ) or (
        "recreio"."account_participations"."state"='closed' and "recreio"."account_participations"."revision"=3 and "recreio"."account_participations"."operation_id" is not null and
        "recreio"."account_participations"."closing_at" is not null and "recreio"."account_participations"."closed_at">="recreio"."account_participations"."closing_at" and "recreio"."account_participations"."updated_at">="recreio"."account_participations"."closed_at"
      )) is true)
);
--> statement-breakpoint
ALTER TABLE "recreio"."account_participations" ADD CONSTRAINT "account_participations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."account_participations" ADD CONSTRAINT "recreio_account_participation_closure" FOREIGN KEY ("operation_id","user_id","operation_kind") REFERENCES "recreio"."rights_operations"("id","requester_user_id","kind") ON DELETE restrict ON UPDATE no action;