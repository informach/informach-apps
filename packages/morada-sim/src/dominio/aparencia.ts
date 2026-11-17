import type { Aparencia, Fase } from "./tipos";

/** Identidades dos corpos do contrato do jogo; independentes do catálogo visual. */
const CORPOS: Record<Aparencia["linha"], Record<Fase, string>> = {
  f: {
    colo: "bebe_f",
    pequeno: "pequena_f",
    crianca: "crianca_f",
    adolescente: "adolescente_f",
    adulto: "adulta",
    idoso: "idosa",
  },
  m: {
    colo: "bebe_m",
    pequeno: "pequeno_m",
    crianca: "crianca_m",
    adolescente: "adolescente_m",
    adulto: "adulto",
    idoso: "idoso",
  },
};

export function corpoDaFase(linha: Aparencia["linha"], fase: Fase): string {
  return CORPOS[linha][fase];
}
