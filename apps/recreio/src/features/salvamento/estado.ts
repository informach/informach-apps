import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { EstadoDeSalvamentoSchema, type SalvamentoVerificado } from "@informach/recreio/contrato";
import { jogoDoCatalogo } from "@/features/jogos/config";
import { env } from "@/lib/env";
import { limitarTentativas } from "@/lib/rate-limit";
import { lerReciboDeSalvamento } from "./repository";

export async function estadoDoSalvamento(capacidade: SalvamentoVerificado) {
  if (env.RECREIO_CHECKPOINT_MODE !== "on") throw new ErroDoRecreio("SEM_PERMISSAO");
  const suporte = jogoDoCatalogo(capacidade.jogo).capacidades.checkpoint;
  if (suporte !== "perfil" && suporte !== "servidor") throw new ErroDoRecreio("SEM_PERMISSAO");
  await limitarTentativas({
    chave: `estado-salvamento:${capacidade.perfilId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  const autorizado = await lerReciboDeSalvamento(
    capacidade,
    suporte === "perfil" ? "profile" : "server",
  );
  return EstadoDeSalvamentoSchema.parse({
    estado: autorizado.recibo.status,
    expiraEm: autorizado.expiraEm.toISOString(),
  });
}
