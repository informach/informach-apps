import "server-only";
import { ErroDoRecreio, MundoIdSchema } from "@informach/recreio";
import { CheckpointDoHostSchema } from "@informach/recreio/contrato";
import { env } from "@/lib/env";
import { limitarTentativas } from "@/lib/rate-limit";
import { confirmarCheckpointDoMundoNoBanco } from "./checkpoint-repository";
import type { Host } from "./service";

export async function confirmarCheckpointDoMundo(host: Host, mundoId: unknown, entrada: unknown) {
  if (env.RECREIO_CHECKPOINT_MODE !== "on") throw new ErroDoRecreio("SEM_PERMISSAO");
  const id = MundoIdSchema.safeParse(mundoId);
  if (!id.success) throw new ErroDoRecreio("NAO_ENCONTRADO");
  const pedido = CheckpointDoHostSchema.parse(entrada);
  await limitarTentativas({
    chave: `checkpoint-host:${host.instanciaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return confirmarCheckpointDoMundoNoBanco(host, id.data, pedido);
}
