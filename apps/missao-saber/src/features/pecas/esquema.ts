import { z } from "zod";
import type { Desafio, Montagem } from "./tipos";

const coordenada = z.number().finite().min(-200).max(200);
const chave = z.string().min(1).max(40);
const poseMalha = z.object({
  x: z.number().int().min(-200).max(200),
  y: z.number().int().min(-200).max(200),
  z: z.number().int().min(-200).max(200),
  o: z.number().int().min(0).max(23),
});
const posePlana = z.object({
  x: coordenada,
  y: coordenada,
  angulo: z.number().finite().min(-720).max(720),
  espelho: z.boolean(),
});
const poseSolida = z.object({
  x: coordenada,
  y: coordenada,
  z: coordenada,
  o: z.number().int().min(0).max(23),
});

export const montagemSchema: z.ZodType<Montagem> = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("malha"), poses: z.record(chave, poseMalha) }),
  z.object({ tipo: z.literal("livre-plano"), poses: z.record(chave, posePlana) }),
  z.object({ tipo: z.literal("livre-espaco"), poses: z.record(chave, poseSolida) }),
]);

/** A montagem viaja como texto (fica gravada na vez da competição). */
export function lerMontagem(texto: string): Montagem | null {
  if (texto.length > 40_000) return null;
  try {
    const lida = montagemSchema.safeParse(JSON.parse(texto));
    return lida.success ? lida.data : null;
  } catch {
    return null;
  }
}

export function desafioLiberado(
  desafio: Desafio,
  acesso: { pago: boolean; perfilLiberado: boolean },
) {
  return desafio.gratuito || (acesso.pago && acesso.perfilLiberado);
}
