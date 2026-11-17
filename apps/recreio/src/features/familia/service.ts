import "server-only";
import { PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { exigirCadastroProtegidoDisponivel } from "./disponibilidade";
import { CadastroDeMenorSchema } from "./regras";
import {
  cancelarCadastroDeMenor,
  confirmarCadastroDeMenor,
  listarMenoresDoResponsavel,
  prepararCadastroDeMenor,
} from "./repository";

export function listarPerfisMenores(autor: IdentidadeNativa, apos?: unknown) {
  return listarMenoresDoResponsavel(autor, apos === undefined ? null : PerfilIdSchema.parse(apos));
}

export async function cancelarPerfilMenor(autor: IdentidadeNativa, intencaoId: unknown) {
  const id = z.uuid().parse(intencaoId);
  await limitarTentativas({
    chave: `cancelar-menor:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return cancelarCadastroDeMenor(autor, id);
}

export async function prepararPerfilMenor(autor: AutorNativoRecente) {
  exigirCadastroProtegidoDisponivel();
  await limitarTentativas({
    chave: `preparar-menor:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return prepararCadastroDeMenor(autor);
}

export async function cadastrarPerfilMenor(autor: AutorNativoRecente, entrada: unknown) {
  exigirCadastroProtegidoDisponivel();
  const pedido = CadastroDeMenorSchema.parse(entrada);
  await limitarTentativas({
    chave: `cadastrar-menor:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 3600,
  });
  return confirmarCadastroDeMenor(autor, pedido);
}
