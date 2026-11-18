import "server-only";
import { ErroDoRecreio, MundoIdSchema } from "@informach/recreio";
import {
  AtestadoDePresencaSchema,
  type PresencaRenovada,
  RenovacaoDePresencasSchema,
} from "@informach/recreio/contrato";
import { jogoQueAbre } from "@/features/jogos/config";
import type { Host } from "@/features/posse/service";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { renovarPresencaNoBanco } from "./renovacao-repository";
import {
  encerrarPresencaNoBanco,
  publicarPresencaNoBanco,
  recuperarReciboDePresenca,
} from "./repository";

export async function atestarPresenca(host: Host, mundoId: unknown, entrada: unknown) {
  const mundo = MundoIdSchema.parse(mundoId),
    pedido = AtestadoDePresencaSchema.parse(entrada);
  await limitarTentativas({
    chave: `presenca-instancia:${host.instanciaId}`,
    max: 240,
    janelaEmSegundos: 60,
  });
  if (pedido.operacao === "sair") return encerrarPresencaNoBanco(host, mundo, pedido);
  const anterior = await recuperarReciboDePresenca(host, mundo, pedido);
  if (anterior) return anterior;
  if (env.RECREIO_VISITS_MODE !== "on" || jogoQueAbre(host.jogo).capacidades.visitas !== true)
    throw new ErroDoRecreio("INDISPONIVEL");
  return publicarPresencaNoBanco(host, mundo, pedido);
}

/** Lote limitado; cada item usa admissão completa, sem inverter travas entre contas. */
export async function renovarPresencas(host: Host, entrada: unknown) {
  const pedido = RenovacaoDePresencasSchema.parse(entrada);
  await limitarTentativas({
    chave: `presenca-instancia:${host.instanciaId}`,
    max: 240,
    janelaEmSegundos: 60,
  });
  if (env.RECREIO_VISITS_MODE !== "on" || jogoQueAbre(host.jogo).capacidades.visitas !== true)
    throw new ErroDoRecreio("INDISPONIVEL");
  const resultados: PresencaRenovada[] = [];
  for (let inicio = 0; inicio < pedido.presencas.length; inicio += 4) {
    const grupo = await Promise.allSettled(
      pedido.presencas.slice(inicio, inicio + 4).map(async (p): Promise<PresencaRenovada> => {
        try {
          return await renovarPresencaNoBanco(host, p);
        } catch (erro) {
          if (
            (erro instanceof AppError && (erro.code === "CONFLITO" || erro.code === "AUTH")) ||
            (erro instanceof ErroDoRecreio &&
              [
                "NAO_ENCONTRADO",
                "POSSE_PERDIDA",
                "NAO_MEMBRO",
                "SESSAO_ENCERRADA",
                "ACESSO_NEGADO",
                "POLITICA_INCOMPATIVEL",
              ].includes(erro.codigo))
          )
            return { presencaId: p.presencaId, estado: "perdida" };
          // Infraestrutura e auditoria precisam continuar falhando no HTTP/monitoramento.
          throw erro;
        }
      }),
    );
    for (const resultado of grupo) {
      if (resultado.status === "rejected") throw resultado.reason;
      resultados.push(resultado.value);
    }
  }
  return { presencas: resultados };
}
