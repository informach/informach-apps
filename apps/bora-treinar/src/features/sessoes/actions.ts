"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CHAINS } from "@/features/treino/catalog/catalog";
import { runAction, verifiedUser } from "@/lib/action";
import { FUSO_PADRAO } from "@/lib/datas";
import { familyView } from "../familia/view";
import { sessionInputSchema } from "./schema";
import { acceptSuggestion, saveSession } from "./service";

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
    revalidatePath("/", "layout");
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
    revalidatePath("/", "layout");
  });
}
