"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { runAction, verifiedUser } from "@/lib/action";
import { FUSO_PADRAO, inicioDaSemana } from "@/lib/datas";
import { AppError } from "@/lib/errors";
import { familyView } from "../familia/view";
import { METRICAS } from "./placar";
import { clearChallenge, setChallenge } from "./repository";

const desafioSchema = z
  .object({
    metric: z.enum(METRICAS),
    exerciseId: z.string().nullable(),
    target: z
      .number({ error: "Digite a meta da semana." })
      .int("Use só números inteiros na meta.")
      .min(1, "A meta precisa ser de pelo menos 1.")
      .max(100000, "A meta pode ir até 100.000."),
  })
  .refine(
    (d) =>
      d.metric === "exercicio"
        ? // só exercícios de repetição: a meta soma repetições, e uma isometria nunca andaria
          EXERCISES.some((e) => e.id === d.exerciseId && e.rule.kind === "reps")
        : d.exerciseId === null,
    "Escolha um exercício de repetições para a meta.",
  );

/** Cria ou troca o desafio cooperativo da família desta semana; `null` encerra. */
export async function challengeAction(input: unknown) {
  return runAction(async () => {
    const user = await verifiedUser();
    const view = await familyView(user.id);
    const semana = inicioDaSemana(new Date(), view.family?.timezone ?? FUSO_PADRAO);
    if (input === null) await clearChallenge(user.id, view.group.id, semana);
    else {
      const desafio = desafioSchema.safeParse(input);
      // a mensagem em português de cada regra, em vez do "confira os campos" genérico
      if (!desafio.success)
        throw new AppError("INPUT", desafio.error.issues[0]?.message ?? "Confira a meta.");
      await setChallenge(user.id, view.group.id, semana, desafio.data);
    }
    revalidatePath("/desafios");
    revalidatePath("/progresso");
  });
}
