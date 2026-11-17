import { FASES } from "@informach/morada-sim";
import { corpoDaFase } from "@informach/morada-sim/conteudo";
import { type Personagem, PersonagemSchema } from "./esquema";

/** Coleção inicial fechada: só passa a ser oferecida depois de toda a matriz ser empacotada. */
export function elencoDaCriacao(): Personagem[] {
  const personagens: Personagem[] = [];
  for (const fase of FASES)
    for (const linha of ["f", "m"] as const) {
      const corpo = corpoDaFase(linha, fase);
      for (const cabelo of ["natural", "careca"] as const)
        for (const roupa of ["cotidiano", "macacao"] as const) {
          personagens.push(
            PersonagemSchema.parse({
              id: `d2_${corpo}_${cabelo}_${roupa}`,
              nome: `Criação ${corpo} ${cabelo} ${roupa}`,
              corpo,
              pele: "#A07050",
              cabelo: { penteado: cabelo === "natural" ? "cabelo" : "careca", cor: "#3B251B" },
              roupa:
                roupa === "macacao"
                  ? {
                      inteira: { id: "nov_macacao", cor: "#7A94B8" },
                      pes: { id: "roupa_tenis_009", cor: null },
                    }
                  : {
                      cima: { id: "nov_manga_longa", cor: "#436B95" },
                      baixo: { id: "nov_calca_social", cor: "#485365" },
                      pes: { id: "roupa_tenis_009", cor: null },
                    },
              sim: { corpo, pele: 0xa07050, cabelo, roupa },
              criacao: {
                rotuloDoCabelo: cabelo === "natural" ? "Natural" : "Sem cabelo",
                rotuloDaRoupa: roupa === "macacao" ? "Macacão" : "Camiseta e calça",
              },
            }),
          );
        }
    }
  return personagens;
}
