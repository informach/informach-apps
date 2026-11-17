import "server-only";
import { createHash } from "node:crypto";
import { ErroDoRecreio } from "@informach/recreio";
import {
  PedidoDeSalvamentoDePerfilSchema,
  ResultadoDeSalvamentoSchema,
  type SalvamentoVerificado,
} from "@informach/recreio/contrato";
import { mutarDadosNaTransacao } from "@/features/dados-de-perfil/repository";
import { jogoDoCatalogo } from "@/features/jogos/config";
import { env } from "@/lib/env";
import { limitarTentativas } from "@/lib/rate-limit";
import { travar } from "@/lib/repository";
import { concluirSalvamentoNoBanco } from "./repository";

/** Somente lote final CAS; nenhuma conquista, descarte ou resolução durante a margem. */
export async function finalizarDadosDoPerfil(
  capacidade: SalvamentoVerificado,
  lerEntrada: () => Promise<unknown>,
) {
  if (env.RECREIO_CHECKPOINT_MODE !== "on") throw new ErroDoRecreio("SEM_PERMISSAO");
  const manifesto = jogoDoCatalogo(capacidade.jogo);
  if (
    !manifesto.capacidades.dadosDePerfil ||
    manifesto.capacidades.mundos !== null ||
    manifesto.capacidades.checkpoint !== "perfil"
  )
    throw new ErroDoRecreio("SEM_PERMISSAO");
  await limitarTentativas({
    chave: `salvamento:${capacidade.perfilId}`,
    max: 10,
    janelaEmSegundos: 60,
  });
  const pedido = PedidoDeSalvamentoDePerfilSchema.parse(await lerEntrada());
  pedido.dados.sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
  const hash = createHash("sha256")
    .update("recreio:final-save:v1\0")
    .update(JSON.stringify(pedido))
    .digest("hex");
  const recibo = await concluirSalvamentoNoBanco(capacidade, hash, {
    modo: "profile",
    travarDominio: (tx) => travar(tx, `dados-perfil:${capacidade.perfilId}:${capacidade.jogo}`),
    persistir: async (tx, contaId) => {
      const resultados: { chave: string; revisao: number; conflitoId?: string }[] = [];
      for (const dado of pedido.dados) {
        const resultado = await mutarDadosNaTransacao(tx, capacidade, contaId, dado);
        if ("revisao" in resultado)
          resultados.push({ chave: dado.chave, revisao: resultado.revisao });
        else if ("conflito" in resultado)
          resultados.push({
            chave: dado.chave,
            revisao: resultado.revisaoAtual,
            conflitoId: resultado.versaoId,
          });
        else throw new ErroDoRecreio("INDISPONIVEL");
      }
      return {
        status: resultados.some((resultado) => resultado.conflitoId) ? "conflicted" : "completed",
        results: resultados,
        checkpointSpaceId: null,
        checkpointFence: null,
        checkpointRevision: null,
        checkpointJournalSeq: null,
      };
    },
  });
  return ResultadoDeSalvamentoSchema.parse({ estado: recibo.status, resultados: recibo.results });
}
