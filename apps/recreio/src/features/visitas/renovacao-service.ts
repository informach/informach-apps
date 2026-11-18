import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { RenovacaoDeVisitasSchema, type VisitaRenovada } from "@informach/recreio/contrato";
import type { Host } from "@/features/posse/service";
import { env } from "@/lib/env";
import { limitarTentativas } from "@/lib/rate-limit";
import { admitirEntradaDeVisitaNoBanco } from "./entrada-repository";
import { recusaDeVisita } from "./http";

function recusaEsperada(erro: unknown): boolean {
  const traduzido = recusaDeVisita(erro);
  return (
    traduzido instanceof ErroDoRecreio &&
    [
      "NAO_ENCONTRADO",
      "NAO_MEMBRO",
      "SESSAO_INVALIDA",
      "SESSAO_ENCERRADA",
      "POSSE_PERDIDA",
      "POSSE_DE_OUTRA_INSTANCIA",
      "ACESSO_NEGADO",
      "ACESSO_PERDIDO",
      "POLITICA_INCOMPATIVEL",
      "SEM_PERMISSAO",
      "JA_MEMBRO",
      "REVISAO_DIVERGENTE",
      "JOGO_INDISPONIVEL",
      "CHECKPOINT_NECESSARIO",
      "MUNDO_CHEIO",
    ].includes(traduzido.codigo)
  );
}

/** Não admite intenções preparadas nem substitui SID. Falha parcial não se anuncia como sucesso. */
export async function renovarVisitas(host: Host, entrada: unknown) {
  const pedido = RenovacaoDeVisitasSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-instancia:${host.instanciaId}`,
    max: 240,
    janelaEmSegundos: 60,
  });
  if (env.RECREIO_VISITS_MODE !== "on" || env.RECREIO_SOCIAL_MODE !== "on")
    return {
      visitas: pedido.visitas.map(
        (p): VisitaRenovada => ({ sessaoDeVisitaId: p.sessaoDeVisitaId, estado: "perdida" }),
      ),
    };
  const visitas: VisitaRenovada[] = [];
  for (let inicio = 0; inicio < pedido.visitas.length; inicio += 4) {
    const resultados = await Promise.allSettled(
      pedido.visitas.slice(inicio, inicio + 4).map(async (p): Promise<VisitaRenovada> => {
        try {
          const renovada = await admitirEntradaDeVisitaNoBanco(
            host,
            p.mundoId,
            p,
            p.sessaoDeVisitaId,
          );
          return {
            sessaoDeVisitaId: p.sessaoDeVisitaId,
            estado: "ok",
            permissaoAte: renovada.permissaoAte,
            agora: renovada.agora,
          };
        } catch (erro) {
          if (recusaEsperada(erro))
            return { sessaoDeVisitaId: p.sessaoDeVisitaId, estado: "perdida" };
          throw erro;
        }
      }),
    );
    // Todos os admitidos terminam antes de devolver inclusive uma falha de infraestrutura.
    for (const resultado of resultados) {
      if (resultado.status === "rejected") throw resultado.reason;
      visitas.push(resultado.value);
    }
  }
  return { visitas };
}
