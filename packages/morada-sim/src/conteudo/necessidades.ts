import type { Fase } from "../dominio/tipos";
import type { DefNecessidade, DefSensacao } from "./esquema";

const DE_PE: readonly Fase[] = ["pequeno", "crianca", "adolescente", "adulto", "idoso"];
const DE_COLO: readonly Fase[] = ["colo"];
const SEM_FRALDA: readonly Fase[] = ["crianca", "adolescente", "adulto", "idoso"];
const DE_FRALDA: readonly Fase[] = ["colo", "pequeno"];

/** Tempos da proposta: quanto cada necessidade leva para esvaziar sem atendimento. */
export const NECESSIDADES: readonly DefNecessidade[] = [
  {
    id: "fome",
    rotulo: "Fome",
    fases: DE_PE,
    esvaziaEmHoras: 14,
    critico: 250_000,
    sensacao: "com_fome",
  },
  {
    id: "energia",
    rotulo: "Energia",
    fases: DE_PE,
    esvaziaEmHoras: 18,
    critico: 200_000,
    sensacao: "cansado",
  },
  {
    id: "higiene",
    rotulo: "Higiene",
    fases: DE_PE,
    esvaziaEmHoras: 20,
    critico: 200_000,
    sensacao: "sujo",
  },
  {
    id: "bexiga",
    rotulo: "Bexiga",
    fases: SEM_FRALDA,
    esvaziaEmHoras: 8,
    critico: 250_000,
    sensacao: "apertado",
  },
  {
    id: "social",
    rotulo: "Social",
    fases: DE_PE,
    esvaziaEmHoras: 30,
    critico: 200_000,
    sensacao: "sozinho",
  },
  {
    id: "diversao",
    rotulo: "Diversão",
    fases: DE_PE,
    esvaziaEmHoras: 24,
    critico: 200_000,
    sensacao: "entediado",
  },
  // Bebê de colo: outro conjunto, mais rápido, sempre atendido por alguém.
  {
    id: "mamar",
    rotulo: "Fome",
    fases: DE_COLO,
    esvaziaEmHoras: 4,
    critico: 300_000,
    sensacao: "chorando_de_fome",
  },
  {
    id: "sono",
    rotulo: "Sono",
    fases: DE_COLO,
    esvaziaEmHoras: 5,
    critico: 250_000,
    sensacao: "chorando_de_sono",
  },
  {
    id: "fralda",
    rotulo: "Fralda",
    fases: DE_FRALDA,
    esvaziaEmHoras: 5,
    critico: 250_000,
    sensacao: "fralda_suja",
  },
  {
    id: "vinculo",
    rotulo: "Vínculo",
    fases: DE_COLO,
    esvaziaEmHoras: 10,
    critico: 250_000,
    sensacao: "pedindo_colo",
  },
];

export const SENSACOES: readonly DefSensacao[] = [
  { id: "com_fome", rotulo: "Com fome", humor: "irritado", peso: 3 },
  { id: "cansado", rotulo: "Cansado", humor: "triste", peso: 2 },
  { id: "sujo", rotulo: "Sujo", humor: "envergonhado", peso: 2 },
  { id: "apertado", rotulo: "Apertado", humor: "tenso", peso: 3 },
  { id: "sozinho", rotulo: "Sozinho", humor: "triste", peso: 2 },
  { id: "entediado", rotulo: "Entediado", humor: "irritado", peso: 1 },
  { id: "chorando_de_fome", rotulo: "Chorando de fome", humor: "triste", peso: 4 },
  { id: "chorando_de_sono", rotulo: "Chorando de sono", humor: "triste", peso: 3 },
  { id: "fralda_suja", rotulo: "Fralda suja", humor: "irritado", peso: 3 },
  { id: "pedindo_colo", rotulo: "Pedindo colo", humor: "triste", peso: 2 },
  { id: "descansado", rotulo: "Descansado", humor: "tranquilo", peso: 2 },
  { id: "limpinho", rotulo: "Limpinho", humor: "tranquilo", peso: 1 },
  { id: "bem_alimentado", rotulo: "Bem alimentado", humor: "alegre", peso: 1 },
  { id: "boa_conversa", rotulo: "Boa conversa", humor: "alegre", peso: 2 },
  { id: "abraco", rotulo: "Abraço gostoso", humor: "alegre", peso: 2 },
  { id: "apaixonado", rotulo: "Apaixonado", humor: "apaixonado", peso: 3 },
  { id: "recem_casado", rotulo: "Recém-casado", humor: "apaixonado", peso: 4 },
  { id: "rejeitado", rotulo: "Rejeitado", humor: "triste", peso: 3 },
  { id: "bebe_nasceu", rotulo: "O bebê nasceu", humor: "alegre", peso: 5 },
  { id: "cuidou_do_bebe", rotulo: "Cuidou do bebê", humor: "tranquilo", peso: 1 },
];
