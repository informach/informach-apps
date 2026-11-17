import "server-only";
import { db } from "@informach/db";
import { agendaAccessInTransaction } from "@/features/billing/access-repository";
import { groupStudentIds } from "@/features/students/repository";
import type { AgendaAuthority } from "./authority";
export function readAgendaCoverage(actor: AgendaAuthority) {
  return db.transaction(async (tx) => {
    const access = await agendaAccessInTransaction(tx, actor);
    const coveredIds = (await groupStudentIds(tx, actor))
      .slice(0, access.profileLimit)
      .map((p) => p.id);
    return { access, coveredIds };
  });
}
