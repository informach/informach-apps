import { PRODUCTS } from "@informach/config";
import {
  type AssinaturaDoGrupo,
  type DecisaoDeAcesso,
  type DecisaoDoPlano,
  decidirPlanoDoGrupo,
  ErroDoRecreio,
  limiteDoPagamentoConciliado,
} from "@informach/recreio";
import { decidirComCobertura, tierDoProduto } from "./cobertura";
import type { AssinaturaLida, FatosDoGrupo, FatosLidos } from "./repository";

function assinaturaDoGrupo(lida: AssinaturaLida | null, agora: Date): AssinaturaDoGrupo | null {
  if (!lida) return null;
  const produto = PRODUCTS.find((item) => item.app === "recreio" && item.id === lida.productId);
  const tier = tierDoProduto(produto?.tier);
  return (
    tier && {
      id: lida.id,
      status: lida.status,
      tier,
      inicioDoPeriodo: lida.inicioDoPeriodo,
      fimDoPeriodo: lida.fimDoPeriodo,
      pagamentoConfirmadoAte: limiteDoPagamentoConciliado(
        {
          ...lida.financeiro,
          status: lida.status,
          inicioDoPeriodo: lida.inicioDoPeriodo,
          fimDoPeriodo: lida.fimDoPeriodo,
          fimDoTeste: lida.fimDoTeste,
          cancelaEm: lida.cancelaEm,
        },
        agora,
      ),
      fimDoTeste: lida.fimDoTeste,
      cancelaEm: lida.cancelaEm,
    }
  );
}

/** Capacidade atual do contrato; o chamador ainda admite titular e composição. */
export function decidirPlanoLido(grupo: FatosDoGrupo, agora: Date): DecisaoDoPlano {
  const lida = grupo.assinaturaAtiva ?? grupo.assinaturaInativa;
  return decidirPlanoDoGrupo({
    agora,
    assinatura: assinaturaDoGrupo(lida, agora),
    teveAssinatura: lida !== null,
    concessoes: grupo.concessoes,
  });
}

/** A mesma decisão para leituras normais e mutações sob trava, sem abrir outra conexão. */
export function decidirFatosLidos(fatos: FatosLidos | null, agora: Date): DecisaoDeAcesso {
  if (!fatos) throw new ErroDoRecreio("SEM_PERFIL");
  const { perfil, grupo } = fatos;
  const lida = grupo?.assinaturaAtiva ?? grupo?.assinaturaInativa ?? null;
  return decidirComCobertura(
    {
      agora,
      perfil: {
        id: perfil.id,
        status: perfil.status,
        grupoId: grupo?.id ?? null,
        versaoDaPolitica: perfil.versaoDaPolitica,
      },
      assinatura: assinaturaDoGrupo(lida, agora),
      teveAssinatura: lida !== null,
      concessoes: grupo?.concessoes ?? [],
    },
    { ligada: perfil.coberturaLigada, cobertosDoGrupo: grupo?.cobertos ?? [] },
  );
}
