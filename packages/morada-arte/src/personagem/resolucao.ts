import { corPeloNome, type TomDePele, tomDePele } from "../cor/cores";
import { ErroDeArte } from "../erros";
import type { Biblioteca } from "../leitura/biblioteca";
import type { ItemDeRoupa, PersonagemDoElenco } from "../leitura/catalogos";
import { type Personagem, PersonagemSchema } from "./esquema";

/**
 * Da descrição de um personagem ao que será montado: as regras da página de
 * referência para o que aparece (`aplicarPersonagem`, `aplicarRoupa`,
 * `penteadoEfetivo`, `corteChapeu`), conferidas contra os catálogos.
 */

export type PecaDoPlano = {
  id: string;
  slot: string;
  /** Cor livre, `#rrggbb`, ou `null` para a textura como está. */
  cor: string | null;
  catalogo: ItemDeRoupa;
};

export type CorteDoCabelo = {
  /** Altura do corte na caixa da cabeça (0 a 1), na frente. */
  f: number;
  /** Quanto o corte desce na nuca, em alturas da caixa da cabeça. */
  inc: number;
};

export type Plano = {
  personagem: Personagem;
  /** `m` ou `f`, da lista de corpos da página. */
  sexo: "m" | "f";
  /** Faixa de idade da página (`recem`, `colo`, `pequeno`, `crianca`, `adolescente`, `adulto`, `idoso`). */
  faixa: string;
  recem: boolean;
  tom: TomDePele;
  /** Cor do cabelo, `#rrggbb`. */
  corDoCabelo: string;
  /**
   * O penteado que aparece: `cabelo` (a malha original do corpo),
   * `cabelo_raspado`, `careca` ou um item do catálogo (com chapéu, a versão
   * `_chapeu` do penteado, quando existe).
   */
  penteado: string;
  barba: string | null;
  /** Peças visíveis, na ordem em que a descrição as traz. */
  pecas: PecaDoPlano[];
  /** Com chapéu que cobre a cabeça: o cabelo acima deste plano não é desenhado. */
  corte: CorteDoCabelo | null;
  /** Esqueleto cuja biblioteca de animação este corpo usa; `null` no recém-nascido. */
  biblioteca: string | null;
  /** O corpo tem formas de gravidez e biblioteca de grávida. */
  engravida: boolean;
};

const onde = (personagem: Personagem): string => `personagem "${personagem.id}"`;

export function resolver(biblioteca: Biblioteca, personagem: Personagem): Plano {
  const { tabelas, roupas, cabelos } = biblioteca;
  const quem = onde(personagem);
  const corpo = tabelas.CORPOS.find((c) => c.id === personagem.corpo);
  if (!corpo) {
    throw new ErroDeArte(
      quem,
      `o corpo "${personagem.corpo}" não está na lista de corpos da página`,
      "corpo",
    );
  }
  const recem = corpo.idade === "recem";
  const tom = tomDePele(tabelas, personagem.pele);
  if (!tom)
    throw new ErroDeArte(
      quem,
      `"${personagem.pele}" não é um tom pronto nem uma cor #rrggbb`,
      "pele",
    );

  const nomeDaCor = personagem.cabelo.cor ?? tabelas.COR_PADRAO[personagem.corpo] ?? "Castanho";
  const corDoCabelo = corPeloNome(tabelas.CABELO_CORES, nomeDaCor);
  if (!corDoCabelo) {
    throw new ErroDeArte(
      quem,
      `"${nomeDaCor}" não é uma cor de cabelo com nome nem #rrggbb`,
      "cabelo.cor",
    );
  }

  if (personagem.objetos.dir || personagem.objetos.esq) {
    throw new ErroDeArte(
      quem,
      "objetos de mão ainda não são montados pelo empacotador (pegada, contato e pose de segurar ficam para depois)",
      "objetos",
    );
  }

  const pecas: PecaDoPlano[] = [];
  if (recem) {
    if (Object.keys(personagem.roupa).length > 0) {
      throw new ErroDeArte(
        quem,
        "o recém-nascido não veste peças do catálogo (usa a manta)",
        "roupa",
      );
    }
  } else {
    if (personagem.recem)
      throw new ErroDeArte(quem, "só o recém-nascido tem manta e gorro", "recem");
    for (const [slot, peca] of Object.entries(personagem.roupa)) {
      const campo = `roupa.${slot}`;
      if (!(slot in roupas.slots) || slot.startsWith("mao_")) {
        throw new ErroDeArte(
          quem,
          `"${slot}" não é uma parte do corpo do catálogo de roupas`,
          campo,
        );
      }
      const item = roupas.itens.get(peca.id);
      if (!item)
        throw new ErroDeArte(quem, `a peça "${peca.id}" não existe no catálogo de roupas`, campo);
      if (item.slot !== slot) {
        throw new ErroDeArte(
          quem,
          `a peça "${peca.id}" é de "${item.slot}", não de "${slot}"`,
          campo,
        );
      }
      if (item.transparente) {
        throw new ErroDeArte(
          quem,
          `a peça "${peca.id}" é uma trama com furos (arrastão), que o empacotador ainda não monta`,
          campo,
        );
      }
      const cor = peca.cor === undefined ? (item.variacao?.cor ?? null) : peca.cor;
      pecas.push({ id: peca.id, slot, cor, catalogo: item });
    }
  }
  // a peça inteira esconde a parte de cima e a de baixo (a jardineira, só a de baixo)
  const inteira = pecas.find((p) => p.slot === "inteira");
  const cobertos = inteira ? (inteira.catalogo.cobre ?? ["cima", "baixo"]) : [];
  const visiveis = pecas.filter((p) => !cobertos.includes(p.slot));

  let penteado = personagem.cabelo.penteado;
  let barba: string | null = null;
  let corte: CorteDoCabelo | null = null;
  if (!recem) {
    const fixos = ["cabelo", "careca", "cabelo_raspado"];
    if (!fixos.includes(penteado) && cabelos.itens.get(penteado)?.tipo !== "cabelo") {
      throw new ErroDeArte(
        quem,
        `o penteado "${penteado}" não existe no catálogo de cabelos`,
        "cabelo.penteado",
      );
    }
    if (personagem.cabelo.barba !== "nenhum") {
      const item = cabelos.itens.get(personagem.cabelo.barba);
      if (item?.tipo !== "rosto") {
        throw new ErroDeArte(
          quem,
          `"${personagem.cabelo.barba}" não é barba nem bigode do catálogo`,
          "cabelo.barba",
        );
      }
      const quemPode = item.so ? (cabelos.grupos[item.so] ?? [item.so]) : null;
      if (quemPode && !quemPode.includes(personagem.corpo)) {
        throw new ErroDeArte(
          quem,
          `"${item.id}" não serve no corpo ${personagem.corpo}`,
          "cabelo.barba",
        );
      }
      barba = item.id;
    }
    // com chapéu, o penteado vira a versão achatada dele; faixa, viseira, tiara, arco e coroa ficam sobre o cabelo
    const chapeu = visiveis.find((p) => p.slot === "cabeca")?.catalogo;
    if (chapeu && chapeu.achata !== false) {
      if (penteado !== "careca" && penteado !== "cabelo_raspado" && !penteado.endsWith("_chapeu")) {
        const base =
          penteado === "cabelo"
            ? cabelos.originais[
                personagem.corpo === "plus_m" ? "p" : corpo.sexo === "f" ? "f" : "m"
              ]
            : penteado;
        if (base && cabelos.itens.has(`${base}_chapeu`)) penteado = `${base}_chapeu`;
      }
      const copa =
        chapeu.gerar?.tipo === "chapeu" ? (chapeu.gerar.copa ?? {}) : { corte: 0.62, inclina: 0.1 };
      corte = { f: Math.max((copa.corte ?? 0.55) - 0.02, 0.4), inc: copa.inclina ?? 0.12 };
    }
  }

  return {
    personagem,
    sexo: corpo.sexo,
    faixa: corpo.idade,
    recem,
    tom,
    corDoCabelo,
    penteado,
    barba,
    pecas: visiveis,
    corte,
    biblioteca: recem ? null : (tabelas.GEMEO[personagem.corpo] ?? personagem.corpo),
    engravida: tabelas.COM_GRAVIDA.includes(personagem.corpo),
  };
}

/** Ids dos arquivos de item que um personagem usa: peças, penteado e barba. */
export function itensDoPersonagem(biblioteca: Biblioteca, personagem: Personagem): string[] {
  const plano = resolver(biblioteca, personagem);
  const ids = plano.pecas.map((p) => p.id);
  if (!["cabelo", "careca", "cabelo_raspado"].includes(plano.penteado) && !plano.recem)
    ids.push(plano.penteado);
  if (plano.barba) ids.push(plano.barba);
  return ids;
}

/** Um personagem do elenco pronto (`codigo/arte/elenco.json`) na descrição do empacotador. */
export function personagemDoElenco(entrada: PersonagemDoElenco): Personagem {
  const recem = "tipo" in entrada.cabelo;
  return PersonagemSchema.parse({
    id: entrada.id,
    nome: entrada.nome,
    corpo: entrada.corpo,
    pele: entrada.pele,
    cabelo:
      "tipo" in entrada.cabelo
        ? { penteado: "cabelo", cor: entrada.cabelo.cor }
        : {
            penteado: entrada.cabelo.penteado,
            cor: entrada.cabelo.cor,
            barba: entrada.cabelo.barba,
          },
    roupa: entrada.roupa ?? {},
    objetos: entrada.objetos ?? {},
    ...(recem && "tipo" in entrada.cabelo
      ? {
          recem: {
            cabelo: entrada.cabelo.tipo,
            manta: entrada.manta ?? "Creme",
            chupeta: entrada.chupeta !== false,
          },
        }
      : {}),
  });
}

/** A descrição no formato de "Salvar personagem" da página, para abrir o mesmo personagem lá. */
export function paraAPagina(
  personagem: Personagem,
  expressao = "neutro",
  gravidez = 0,
): Record<string, unknown> {
  const base = {
    formato: "morada-personagem",
    versao: 1,
    corpo: personagem.corpo,
    pele: personagem.pele,
    expressao,
  };
  if (personagem.recem) {
    return {
      ...base,
      cabelo: { tipo: personagem.recem.cabelo, cor: personagem.cabelo.cor },
      manta: personagem.recem.manta,
      chupeta: personagem.recem.chupeta,
    };
  }
  return {
    ...base,
    cabelo: personagem.cabelo,
    roupa: personagem.roupa,
    objetos: personagem.objetos,
    gravidez,
  };
}
