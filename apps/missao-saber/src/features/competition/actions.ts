"use server";
import { revalidatePath } from "next/cache";
import { recentParent, runAction, verifiedUser } from "@/lib/action";
import { answerTurn, createCompetition, deleteCompetition, endTurn, startTurn } from "./service";

/*
 * Criar e apagar pedem a confirmação recente do responsável. Conduzir a sala
 * (começar, responder, encerrar a vez) usa só a sessão verificada: uma
 * competição dura mais que os dez minutos da confirmação.
 */
export async function createCompetitionAction(input: unknown) {
  return runAction(async () => {
    const id = await createCompetition((await recentParent()).id, input);
    revalidatePath("/familia/competicoes");
    return { id };
  });
}
export async function deleteCompetitionAction(id: string) {
  return runAction(async () => {
    await deleteCompetition((await recentParent()).id, id);
    revalidatePath("/familia/competicoes");
  });
}
export async function startTurnAction(id: string) {
  return runAction(async () => startTurn((await verifiedUser()).id, id));
}
export async function answerTurnAction(id: string, input: unknown) {
  return runAction(async () => answerTurn((await verifiedUser()).id, id, input));
}
export async function endTurnAction(id: string, input: unknown) {
  return runAction(async () => endTurn((await verifiedUser()).id, id, input));
}
