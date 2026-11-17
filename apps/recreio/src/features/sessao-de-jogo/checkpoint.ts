import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { ConfirmacaoDeCheckpointSchema } from "@informach/recreio/contrato";
import { env } from "@/lib/env";
import { limitarTentativas } from "@/lib/rate-limit";
import { confirmarCheckpointDePerfil } from "./checkpoint-repository";
import type { SessaoDeJogoAtiva } from "./service";

export async function confirmarCheckpoint(sessao: SessaoDeJogoAtiva, entrada: unknown) {
  const pedido = ConfirmacaoDeCheckpointSchema.parse(entrada);
  if (env.RECREIO_CHECKPOINT_MODE !== "on") throw new ErroDoRecreio("SEM_PERMISSAO");
  await limitarTentativas({
    chave: `checkpoint:${sessao.perfilId}`,
    max: 20,
    janelaEmSegundos: 60,
  });
  return confirmarCheckpointDePerfil(sessao, pedido);
}
