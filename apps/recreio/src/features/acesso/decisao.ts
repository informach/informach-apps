import { PRODUCTS } from "@informach/config";
import { type AssinaturaDoGrupo, type DecisaoDeAcesso, ErroDoRecreio } from "@informach/recreio";
import { decidirComCobertura, tierDoProduto } from "./cobertura";
import type { AssinaturaLida, FatosLidos } from "./repository";

function assinaturaDoGrupo(lida: AssinaturaLida | null): AssinaturaDoGrupo | null {
  if (!lida) return null;
  const produto = PRODUCTS.find((item) => item.app === "recreio" && item.id === lida.productId);
  const tier = tierDoProduto(produto?.tier);
  return tier && { id: lida.id, status: lida.status, tier, cancelaEm: lida.cancelaEm };
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
      assinatura: assinaturaDoGrupo(lida),
      teveAssinatura: lida !== null,
      concessoes: grupo?.concessoes ?? [],
    },
    { ligada: perfil.coberturaLigada, cobertosDoGrupo: grupo?.cobertos ?? [] },
  );
}
