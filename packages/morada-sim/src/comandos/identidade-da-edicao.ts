import { z } from "zod";

/** Independente dos 512 comandos genéricos e do histórico de desfazer. */
export const RESPOSTAS_DE_EDICAO = 32;
export const RESPOSTAS_DE_EDICAO_DO_MUNDO = 128;
export const AUTORES_DE_EDICAO_DO_MUNDO = 2048;
export const LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS = 50_000;
export const OBJETOS_POR_LOTE = 256;

export const SequenciaDeEdicaoSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const AutorDeEdicaoSchema = z.string().regex(/^[A-Za-z0-9_-]{1,44}$/);

/** A mesma validação no navegador e no host, sem carregar schemas do diário. */
export function comandoDeEdicao(perfilId: string, numero: number): string {
  return `obra:${SequenciaDeEdicaoSchema.parse(numero).toString(36)}:${AutorDeEdicaoSchema.parse(perfilId)}`;
}
