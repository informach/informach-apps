import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import type { z } from "zod";
import { findAccessibleProfile } from "@/features/family/access";
import { recordProductEvent } from "@/features/metrics/events";
import { findSubjectKits, subjectBelongsToProfile, upsertSubjectKit } from "./repository";
import type { saveSubjectKitSchema } from "./schemas";

/**
 * "Levar sempre": o que vai na mochila toda vez que a matéria tem aula.
 *
 * Tênis na educação física, flauta na música. Não é atividade — não tem prazo,
 * não se conclui e não entra em contagem nenhuma. Cadastrar isso como vinte
 * lembretes semanais transformaria uma lista de três itens em vinte obrigações
 * que alguém tem de marcar como feitas.
 */
export async function listSubjectKits(userId: string, profileIds: string[]) {
  const rows = await findSubjectKits(userId, profileIds);
  // Chave por (criança, matéria): a matéria é compartilhada entre famílias e
  // duas irmãs na mesma turma levam coisas diferentes.
  const byKey = new Map<string, string[]>();
  for (const row of rows) {
    const subject = row.subjectId ?? row.profileSubjectId;
    if (subject) byKey.set(`${row.profileId}:${subject}`, row.items);
  }
  return byKey;
}

export async function saveSubjectKit(userId: string, input: z.infer<typeof saveSubjectKitSchema>) {
  const profile = await findAccessibleProfile(userId, input.profileId);
  if (!profile) return err({ code: "INVALID_PROFILE" } as const);
  if (!(await subjectBelongsToProfile(profile.id, input)))
    return err({ code: "INVALID_SUBJECT" } as const);
  const items = [...new Set(input.items.map((item) => item.trim()).filter(Boolean))];
  await upsertSubjectKit({
    profileId: profile.id,
    subjectId: input.subjectId,
    profileSubjectId: input.profileSubjectId,
    items,
  });
  await recordProductEvent(userId, { event: "subject_kit_saved", count: items.length });
  return ok({ items });
}
