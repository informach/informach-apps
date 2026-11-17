import { faixaPermite } from "@informach/config/jogos";
import type { PoliticaDoPerfil } from "@informach/recreio/contrato";
import type { ManifestoDoJogo } from "@/features/jogos/catalogo";

/** Classificação do título não reduz a faixa mínima do conteúdo de cada mundo. */
export function mundoCompativel(
  manifesto: ManifestoDoJogo,
  politica: Pick<PoliticaDoPerfil, "faixa" | "multiplayer"> | null,
  mundo: { politicaDeConteudo: string; membros: number },
) {
  if (!politica) return true;
  const variantes = manifesto.politicasDeMundo ?? [];
  const faixa =
    variantes.find((item) => item.id === mundo.politicaDeConteudo)?.faixaMinima ??
    (variantes.length === 0 && mundo.politicaDeConteudo === "padrao"
      ? manifesto.classificacao.faixa
      : null);
  return (
    faixa !== null &&
    faixaPermite(politica.faixa, faixa) &&
    (politica.multiplayer || mundo.membros <= 1)
  );
}
