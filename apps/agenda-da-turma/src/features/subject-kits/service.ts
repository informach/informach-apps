import "server-only";
import { err } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import type { z } from "zod";
import type { AgendaAuthority } from "@/features/family/authority";
import { recordProductEvent } from "@/features/metrics/events";
import { findSubjectKits, upsertSubjectKit } from "./repository";
import type { saveSubjectKitSchema } from "./schemas";

/**
 * "Levar sempre": o que vai na mochila toda vez que a matéria tem aula.
 *
 * Tênis na educação física, flauta na música. Não é atividade — não tem prazo,
 * não se conclui e não entra em contagem nenhuma. Cadastrar isso como vinte
 * lembretes semanais transformaria uma lista de três itens em vinte obrigações
 * que alguém tem de marcar como feitas.
 */
export async function listSubjectKits(actor: AgendaAuthority, profileIds: string[]) {
  const rows = await findSubjectKits(actor, profileIds);
  // Chave por (criança, matéria): a matéria é compartilhada entre famílias e
  // duas irmãs na mesma turma levam coisas diferentes.
  const byKey = new Map<string, string[]>();
  for (const row of rows) {
    const subject = row.subjectId ?? row.profileSubjectId;
    if (subject) byKey.set(`${row.profileId}:${subject}`, row.items);
  }
  return byKey;
}

export async function saveSubjectKit(
  actor: AgendaAuthority,
  input: z.infer<typeof saveSubjectKitSchema>,
) {
  const items = [...new Set(input.items.map((item) => item.trim()).filter(Boolean))];
  try {
    const result = await upsertSubjectKit(actor, { ...input, items });
    if (result.ok)
      await recordProductEvent(actor.userId, { event: "subject_kit_saved", count: items.length });
    return result;
  } catch (error) {
    if (error instanceof FamilyError) return err({ code: "INVALID_PROFILE" } as const);
    throw error;
  }
}
