import type { Manifesto } from "@informach/morada-arte/manifesto";
import {
  type CatalogoDeAparencias,
  CatalogoDeAparenciasSchema,
  conferirContinuidadeDaAparencia,
} from "@informach/morada-sim";

/** A lista permitida vem somente do pacote já validado pelo servidor. */
export function catalogoDeAparenciasDaArte(manifesto: Manifesto): CatalogoDeAparencias | undefined {
  if (manifesto.versao !== 3) return undefined;
  const opcoes = manifesto.personagens.flatMap((p) => {
    if (!p.criacao) return [];
    if (!p.cores || !p.sim) throw new Error(`Criação sem canais ou receita: ${p.id}`);
    return [
      {
        id: p.id,
        fase: p.faixa,
        linha: p.sexo,
        corpo: p.corpo,
        cabelo: p.sim.cabelo,
        roupa: p.sim.roupa,
        rotuloDoCabelo: p.criacao.rotuloDoCabelo,
        rotuloDaRoupa: p.criacao.rotuloDaRoupa,
        peleInicial: p.sim.pele,
        edicaoInicial: {
          versao: 1,
          corDoCabelo: p.criacao.corDoCabelo,
          coresDaRoupa: p.criacao.coresDaRoupa,
        },
      },
    ];
  });
  if (opcoes.length === 0) return undefined;
  const catalogo = CatalogoDeAparenciasSchema.parse({
    formato: "morada.aparencias",
    versao: 1,
    opcoes,
  });
  conferirContinuidadeDaAparencia(catalogo);
  return catalogo;
}

/** Atualizar a arte não autoriza reinterpretar receitas já gravadas. */
export function conferirCatalogoDisponivel(
  admitido: CatalogoDeAparencias | null,
  instalado: CatalogoDeAparencias | undefined,
): void {
  if (!admitido) return;
  if (!instalado)
    throw new Error("O pacote instalado não atende ao catálogo de aparências deste mundo");
  for (const opcao of admitido.opcoes) {
    const atual = instalado.opcoes.find((o) => o.id === opcao.id);
    if (
      !atual ||
      atual.fase !== opcao.fase ||
      atual.linha !== opcao.linha ||
      atual.corpo !== opcao.corpo ||
      atual.cabelo !== opcao.cabelo ||
      atual.roupa !== opcao.roupa ||
      JSON.stringify(Object.keys(atual.edicaoInicial.coresDaRoupa).sort()) !==
        JSON.stringify(Object.keys(opcao.edicaoInicial.coresDaRoupa).sort())
    )
      throw new Error(`O pacote instalado não atende à aparência ${opcao.id} deste mundo`);
  }
}
