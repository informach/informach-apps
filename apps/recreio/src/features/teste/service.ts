import "server-only";
import { z } from "zod";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { ConsentimentoDoTesteSchema } from "./regras";
import {
  consultarMeuTesteNoBanco,
  registrarConsentimentoNoBanco,
  retirarConsentimentoNoBanco,
} from "./repository";

export async function autorizarExperimento(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = ConsentimentoDoTesteSchema.parse(entrada);
  assertAllowed(
    env.RECREIO_TRIAL_MODE !== "off",
    "INDISPONIVEL",
    "O teste ainda não está disponível.",
  );
  await limitarTentativas({
    chave: `teste-consentimento:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return registrarConsentimentoNoBanco(autor, pedido);
}

export async function consultarMeuTeste(autor: IdentidadeNativa) {
  await limitarTentativas({
    chave: `teste-leitura:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return { ...(await consultarMeuTesteNoBanco(autor)), modo: env.RECREIO_TRIAL_MODE };
}

export async function retirarConsentimentoDoTeste(autor: IdentidadeNativa, entrada: unknown) {
  const id = z.uuid().parse(entrada);
  await limitarTentativas({
    chave: `teste-retirada:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return retirarConsentimentoNoBanco(autor, id);
}
