"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { studyProfileFromInput } from "@/features/study-access/server";
import { runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import { getAccess } from "../billing/service";
import { allowedProfileIds } from "../family/profile-access";
import { getProfiles } from "../learning/repository";
import { encontrarDesafio } from "./catalogo";
import { desafioLiberado, montagemSchema } from "./esquema";
import { recordSolve } from "./repository";
import { verificar } from "./verificar";

const entrada = z.object({
  profileId: z.string().uuid(),
  desafioId: z.string().min(1).max(60),
  montagem: montagemSchema,
  segundos: z.number().int().min(0).max(86_400),
});

/** Registra no laboratório um desafio montado; o servidor confere a montagem. */
export async function registrarMontagemAction(input: unknown) {
  return runAction(async () => {
    const identidade = await studyProfileFromInput(input);
    const dados = entrada.parse(input);
    const desafio = encontrarDesafio(dados.desafioId);
    assertAllowed(desafio, "NOT_FOUND", "Desafio não encontrado.");
    const [acesso, perfis] = await Promise.all([
      getAccess(identidade.userId),
      getProfiles(identidade.userId),
    ]);
    const perfilLiberado = allowedProfileIds(perfis, acesso.profileLimit).includes(
      identidade.profileId,
    );
    assertAllowed(
      desafioLiberado(desafio, { pago: acesso.paid, perfilLiberado }),
      "PLAN",
      "Este desafio faz parte da assinatura.",
    );
    assertAllowed(
      verificar(desafio, dados.montagem).montado,
      "NOT_SOLVED",
      "A montagem ainda não fechou.",
    );
    const linha = await recordSolve(identidade.profileId, desafio.id, dados.segundos);
    revalidatePath("/laboratorio/pecas");
    return { montagens: linha?.solves ?? 1, melhor: linha?.bestSeconds ?? dados.segundos };
  });
}
