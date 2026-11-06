"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CHAINS } from "@/features/treino/catalog/catalog";
import { runAction, verifiedUser } from "@/lib/action";
import { FUSO_PADRAO } from "@/lib/datas";
import { familyView } from "../familia/view";
import { groupInputSchema, sessionInputSchema } from "./schema";
import { acceptSuggestion, saveGroupSession, saveSession } from "./service";

/**
 * As telas que mostram o resultado de um treino. Nada de `revalidatePath("/", "layout")`: ele
 * mandava props novas ao player aberto e recriava o executor, zerando um treino em andamento
 * quando a fila offline salvava outro treino no meio dele.
 */
function revalidarTelasDoTreino() {
  for (const p of ["/inicio", "/progresso", "/perfis", "/desafios", "/exercicios"])
    revalidatePath(p);
}

/** Grava o treino que o player acabou de concluir (ou que estava na fila sem rede). */
export async function saveSessionAction(input: unknown) {
  return runAction(async () => {
    const session = sessionInputSchema.parse(input);
    const user = await verifiedUser();
    const view = await familyView(user.id);
    const result = await saveSession(
      user.id,
      view.access,
      view.profiles.filter((p) => p.allowed).map((p) => p.id),
      session,
      view.family?.timezone ?? FUSO_PADRAO,
    );
    revalidarTelasDoTreino();
    return result;
  });
}

/** Treinar junto: grava o treino de cada perfil do grupo, todos ou nenhum. */
export async function saveGroupAction(input: unknown) {
  return runAction(async () => {
    const grupo = groupInputSchema.parse(input);
    const user = await verifiedUser();
    const view = await familyView(user.id);
    const result = await saveGroupSession(
      user.id,
      view.access,
      view.profiles.filter((p) => p.allowed).map((p) => p.id),
      grupo,
      view.family?.timezone ?? FUSO_PADRAO,
    );
    revalidarTelasDoTreino();
    return result;
  });
}

/** Aceita o avanço de uma trilha. O servidor confere de novo se ele ainda vale. */
export async function acceptSuggestionAction(profileId: string, chainId: string) {
  return runAction(async () => {
    const id = z.uuid().parse(profileId);
    const chain = z.enum(CHAINS.map((c) => c.id) as [string, ...string[]]).parse(chainId);
    const user = await verifiedUser();
    const view = await familyView(user.id);
    await acceptSuggestion(
      view.access,
      view.profiles.filter((p) => p.allowed).map((p) => p.id),
      id,
      chain,
    );
    revalidarTelasDoTreino();
  });
}
