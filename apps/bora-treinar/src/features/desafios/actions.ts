"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canUseChallenges } from "@/features/acesso/policy";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { runAction, verifiedUser } from "@/lib/action";
import { FUSO_PADRAO, inicioDaSemana } from "@/lib/datas";
import { assertAllowed } from "@/lib/errors";
import { familyView } from "../familia/view";
import { METRICAS } from "./placar";
import { clearChallenge, setChallenge } from "./repository";

const desafioSchema = z
  .object({
    metric: z.enum(METRICAS),
    exerciseId: z.string().nullable(),
    target: z.number().int().min(1).max(100000),
  })
  .refine(
    (d) =>
      d.metric === "exercicio"
        ? EXERCISES.some((e) => e.id === d.exerciseId)
        : d.exerciseId === null,
    "Escolha um exercício para a meta.",
  );

/** Cria ou troca o desafio desta semana; `null` encerra. */
export async function challengeAction(input: unknown) {
  return runAction(async () => {
    const user = await verifiedUser();
    const view = await familyView(user.id);
    assertAllowed(canUseChallenges(view.access), "PLAN", "Os desafios fazem parte da assinatura.");
    const semana = inicioDaSemana(new Date(), view.family?.timezone ?? FUSO_PADRAO);
    if (input === null) await clearChallenge(user.id, semana);
    else await setChallenge(user.id, semana, desafioSchema.parse(input));
    revalidatePath("/desafios");
  });
}
