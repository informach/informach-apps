import { z } from "zod";
import type { EstadoDoMundo } from "../dominio/tipos";

/**
 * Fotografia: o estado durável de um mundo em um tick. É o que vai para o
 * armazenamento e o que volta na recuperação. Não leva presença nem caches.
 *
 * Cada formato tem `{ formato, versao }`. Um mundo antigo passa pela cadeia de
 * migrações antes de ser lido; um mundo de versão mais nova que este código é
 * recusado, nunca adivinhado.
 */

export const VERSAO_DO_MUNDO = 1;
export const VERSAO_DA_FOTOGRAFIA = 1;

const EnvelopeSchema = z.object({
  formato: z.literal("morada.foto"),
  versao: z.number().int().positive(),
  mundoId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  estado: z.object({
    formato: z.literal("morada.mundo"),
    versao: z.number().int().positive(),
  }),
});

export type Fotografia = {
  formato: "morada.foto";
  versao: typeof VERSAO_DA_FOTOGRAFIA;
  mundoId: string;
  tick: number;
  estado: EstadoDoMundo;
};

/** Um passo da cadeia: leva o mundo da versão `de` para `de + 1`. */
export type Migracao = {
  de: number;
  migrar(estado: Record<string, unknown>): Record<string, unknown>;
};

/** As migrações do formato do mundo, em ordem. Vazia enquanto só existe a versão 1. */
export const MIGRACOES_DO_MUNDO: readonly Migracao[] = [];

export function migrar(
  estado: Record<string, unknown>,
  ate: number,
  migracoes: readonly Migracao[],
): Record<string, unknown> {
  let atual = estado;
  let versao = Number(atual.versao);
  if (!Number.isInteger(versao) || versao < 1) throw new Error("Mundo sem versão de formato");
  if (versao > ate) {
    throw new Error(`Mundo da versão ${versao}; este servidor lê até a versão ${ate}`);
  }
  while (versao < ate) {
    const passo = migracoes.find((migracao) => migracao.de === versao);
    if (!passo) throw new Error(`Falta a migração da versão ${versao} para a ${versao + 1}`);
    atual = { ...passo.migrar(atual), versao: versao + 1 };
    versao++;
  }
  return atual;
}

/** Confere o envelope, migra se preciso e devolve a fotografia pronta para restaurar. */
export function abrirFotografia(bruto: unknown): Fotografia {
  const envelope = EnvelopeSchema.parse(bruto);
  if (envelope.versao !== VERSAO_DA_FOTOGRAFIA) {
    throw new Error(`Fotografia da versão ${envelope.versao} não é lida por este servidor`);
  }
  const estado = migrar(
    (bruto as { estado: Record<string, unknown> }).estado,
    VERSAO_DO_MUNDO,
    MIGRACOES_DO_MUNDO,
  );
  if (estado.id !== envelope.mundoId) throw new Error("A fotografia é de outro mundo");
  return {
    formato: "morada.foto",
    versao: VERSAO_DA_FOTOGRAFIA,
    mundoId: envelope.mundoId,
    tick: envelope.tick,
    estado: estado as unknown as EstadoDoMundo,
  };
}
