-- A tabela virou a única linha de execução da família: escola, extras e
-- recados. O nome `notice_actions` descrevia a origem de uma minoria das
-- linhas (hoje a maioria tem `notice_id IS NULL`) e por isso confundia quem
-- lê o schema. Só nomes mudam aqui; nenhum dado é reescrito.
ALTER TABLE "agenda"."notice_actions" RENAME TO "tasks";
--> statement-breakpoint
ALTER TABLE "agenda"."activity_revisions" RENAME COLUMN "notice_action_id" TO "task_id";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "notice_actions_notice_id_notices_id_fk" TO "tasks_notice_id_notices_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "notice_actions_shared_activity_id_activities_id_fk" TO "tasks_shared_activity_id_activities_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "notice_actions_profile_id_student_profiles_id_fk" TO "tasks_profile_id_student_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "notice_actions_created_by_user_id_users_id_fk" TO "tasks_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "notice_actions_assigned_to_user_id_users_id_fk" TO "tasks_assigned_to_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "notice_actions_subject_id_subjects_id_fk" TO "tasks_subject_id_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "notice_actions_profile_subject_id_profile_subjects_id_fk" TO "tasks_profile_subject_id_profile_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."activity_revisions" RENAME CONSTRAINT "activity_revisions_notice_action_id_notice_actions_id_fk" TO "activity_revisions_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "agenda_action_date_origin_check" TO "agenda_task_date_origin_check";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "agenda_action_time_check" TO "agenda_task_time_check";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "agenda_action_status_check" TO "agenda_task_status_check";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "agenda_action_subject_exclusive_check" TO "agenda_task_subject_exclusive_check";
--> statement-breakpoint
ALTER INDEX "agenda"."agenda_notice_actions_profile_due_idx" RENAME TO "agenda_tasks_profile_due_idx";
--> statement-breakpoint
ALTER INDEX "agenda"."agenda_notice_actions_reminder_idx" RENAME TO "agenda_tasks_reminder_idx";
--> statement-breakpoint
ALTER INDEX "agenda"."agenda_notice_actions_notice_profile_idx" RENAME TO "agenda_tasks_notice_profile_idx";
--> statement-breakpoint
ALTER INDEX "agenda"."agenda_notice_actions_series_due_idx" RENAME TO "agenda_tasks_series_due_idx";
--> statement-breakpoint
ALTER INDEX "agenda"."agenda_notice_actions_subject_idx" RENAME TO "agenda_tasks_subject_idx";
--> statement-breakpoint
ALTER INDEX "agenda"."agenda_notice_actions_profile_subject_idx" RENAME TO "agenda_tasks_profile_subject_idx";
--> statement-breakpoint
ALTER INDEX "agenda"."agenda_notice_revision_version_idx" RENAME TO "agenda_task_revision_version_idx";
--> statement-breakpoint
ALTER TABLE "agenda"."tasks" RENAME CONSTRAINT "notice_actions_pkey" TO "tasks_pkey";
