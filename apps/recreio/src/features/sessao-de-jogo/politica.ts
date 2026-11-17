import type { PoliticaDoPerfil } from "@informach/recreio/contrato";
import type { ManifestoDoJogo } from "@/features/jogos/catalogo";

/**
 * A permissão efetiva do perfil também respeita a capacidade do título.
 * Sessão e entrada na instância recebem a mesma política, sem dados da conta.
 */
export function politicaDaAdmissao(
  contexto: {
    politica: { politica: Pick<PoliticaDoPerfil, "faixa" | "multiplayer" | "textoLivre"> } | null;
    versaoDaPolitica: number;
  },
  manifesto: ManifestoDoJogo,
): PoliticaDoPerfil {
  return {
    multiplayer: contexto.politica?.politica.multiplayer ?? true,
    textoLivre:
      manifesto.capacidades.textoLivre && (contexto.politica?.politica.textoLivre ?? true),
    faixa: contexto.politica?.politica.faixa ?? "18",
    versao: contexto.versaoDaPolitica,
  };
}
