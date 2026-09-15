import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

/**
 * Leva atividades escolares e extracurriculares para `agenda.notice_actions`.
 *
 * Idempotente pelo id: a tarefa de uma atividade escolar nasce com o id da
 * linha de `activity_statuses` (uma por criança, que é exatamente a
 * granularidade de `tasks`), e a de uma extracurricular nasce com o id da
 * própria linha. Rodar de novo é `ON CONFLICT DO NOTHING`.
 *
 * O fingerprint é calculado aqui, em TypeScript, com a mesma função do app —
 * reproduzir `JSON.stringify` e a normalização NFKC em SQL daria um valor
 * parecido e errado, e a detecção de duplicata passaria a não encontrar o que
 * existe.
 */
function actionFingerprint(title: string, dueAt: string | null, type: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        title.normalize("NFKC").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " "),
        dueAt,
        type,
      ]),
    )
    .digest("hex");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to backfill tasks");

  const client = postgres(databaseUrl, { max: 1 });

  // As tabelas antigas são removidas pela migração 0052, depois de a
  // convergência ter sido verificada. A partir daí este passo não tem o que
  // levar — e um banco novo nunca terá. Sair em silêncio é o comportamento
  // certo: falhar aqui travaria `db:migrate` para sempre.
  const [legacy] = await client`
    SELECT to_regclass('agenda.activity_statuses') IS NOT NULL
       AND to_regclass('agenda.profile_subject_activities') IS NOT NULL AS present
  `;
  if (!legacy?.present) {
    console.log("[db:backfill-tasks] tabelas antigas já removidas; nada a migrar");
    await client.end();
    return;
  }

  console.log("[db:backfill-tasks] lendo atividades escolares...");
  const school = await client`
    SELECT s.id AS status_id, s.student_profile_id, s.status,
           a.id AS activity_id, a.created_by_user_id, a.type, a.subject_id,
           a.title, a.description, a.due_at, a.version, a.canceled_at,
           a.created_at, a.updated_at
    FROM agenda.activity_statuses s
    JOIN agenda.activities a ON a.id = s.activity_id
  `;

  console.log("[db:backfill-tasks] lendo extracurriculares...");
  const extra = await client`
    SELECT e.id, e.profile_id, e.profile_subject_id, e.created_by_user_id, e.type,
           e.title, e.description, e.due_at, e.status, e.created_at, e.updated_at
    FROM agenda.profile_subject_activities e
  `;

  let inserted = 0;
  await client.begin(async (tx) => {
    for (const row of school) {
      const dueAt: string | null = row.due_at ? String(row.due_at) : null;
      const status = row.canceled_at ? "canceled" : row.status;
      const result = await tx`
        INSERT INTO agenda.notice_actions (
          id, notice_id, profile_id, created_by_user_id, assigned_to_user_id,
          type, subject_id, profile_subject_id, title, description, due_at,
          "time", location, date_origin, source_excerpt, status, completed_at,
          reminder_at, recurrence, series_id, version, fingerprint,
          shared_activity_id, created_at, updated_at
        ) VALUES (
          ${row.status_id}, NULL, ${row.student_profile_id}, ${row.created_by_user_id}, NULL,
          ${row.type}, ${row.subject_id}, NULL, ${row.title}, ${row.description}, ${dueAt},
          NULL, NULL, ${dueAt ? "family" : "unspecified"}, NULL, ${status}, NULL,
          NULL, 'none', NULL, ${row.version ?? 1},
          ${actionFingerprint(String(row.title), dueAt, String(row.type))},
          ${row.activity_id}, ${row.created_at}, ${row.updated_at}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      inserted += result.length;
    }

    for (const row of extra) {
      const dueAt: string | null = row.due_at ? String(row.due_at) : null;
      const result = await tx`
        INSERT INTO agenda.notice_actions (
          id, notice_id, profile_id, created_by_user_id, assigned_to_user_id,
          type, subject_id, profile_subject_id, title, description, due_at,
          "time", location, date_origin, source_excerpt, status, completed_at,
          reminder_at, recurrence, series_id, version, fingerprint,
          shared_activity_id, created_at, updated_at
        ) VALUES (
          ${row.id}, NULL, ${row.profile_id}, ${row.created_by_user_id}, NULL,
          ${row.type}, NULL, ${row.profile_subject_id}, ${row.title}, ${row.description}, ${dueAt},
          NULL, NULL, ${dueAt ? "family" : "unspecified"}, NULL, ${row.status}, NULL,
          NULL, 'none', NULL, 1,
          ${actionFingerprint(String(row.title), dueAt, String(row.type))},
          NULL, ${row.created_at}, ${row.updated_at}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      inserted += result.length;
    }
  });

  const [check] = await client`
    SELECT
      (SELECT count(*) FROM agenda.activity_statuses) AS escolares,
      (SELECT count(*) FROM agenda.profile_subject_activities) AS extras,
      (SELECT count(*) FROM agenda.notice_actions WHERE shared_activity_id IS NOT NULL) AS tarefas_escolares,
      (SELECT count(*) FROM agenda.notice_actions WHERE profile_subject_id IS NOT NULL AND notice_id IS NULL) AS tarefas_extras
  `;
  console.log(`[db:backfill-tasks] inseridas ${inserted} tarefas`);
  console.log(`[db:backfill-tasks] conferência: ${JSON.stringify(check)}`);

  await client.end();
}

main().catch((error) => {
  console.error("[db:backfill-tasks] falhou:", error);
  process.exit(1);
});
