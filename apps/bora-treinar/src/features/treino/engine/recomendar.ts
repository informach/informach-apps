import type { Intensidade } from "../catalog/workouts";

/**
 * "Hoje é dia de": escolhe o treino do perfil, de forma determinística e explicável. Puro e
 * testado; quem chama passa o catálogo já marcado com o que o plano libera.
 */
export interface Candidato {
  ref: string;
  name: string;
  focus: string;
  level: "Iniciante" | "Intermediário" | "Avançado";
  minutos: number;
  locked: boolean;
}

export interface Recomendacao {
  ref: string;
  /** a frase que explica a escolha ("Ontem foi Força; hoje, Cardio, no seu tempo") */
  motivo: string;
}

interface Entrada {
  candidatos: readonly Candidato[];
  /** treinos recentes do perfil, do mais antigo ao mais novo */
  recentes: readonly { workoutRef: string; startedAt: number }[];
  minutosPref: number | null;
  intensidade: Intensidade;
  /** o perfil já treinou hoje (no fuso da família) */
  treinouHoje: boolean;
  /** número do dia (para variar entre empates sem sorteio) */
  dia: number;
}

const PRIMEIRO = "catalogo:primeiro-treino";
const LEVE = "catalogo:aquecimento-5";
const NIVEL_IDEAL: Record<Intensidade, Candidato["level"][]> = {
  leve: ["Iniciante"],
  normal: ["Iniciante", "Intermediário"],
  forte: ["Intermediário", "Avançado"],
};

export function recomendar(e: Entrada): Recomendacao | null {
  const abertos = e.candidatos.filter((c) => !c.locked);
  if (!abertos.length) return null;
  const porRef = (ref: string) => abertos.find((c) => c.ref === ref);

  if (!e.recentes.length) {
    const primeiro = porRef(PRIMEIRO) ?? abertos[0];
    return primeiro
      ? { ref: primeiro.ref, motivo: "Para começar: o treino que apresenta os movimentos." }
      : null;
  }
  if (e.treinouHoje) {
    const leve = porRef(LEVE);
    if (leve) return { ref: leve.ref, motivo: "Você já treinou hoje. Se quiser mais, algo leve." };
  }

  const ultimo = e.recentes.at(-1);
  const ultimoFoco = ultimo ? e.candidatos.find((c) => c.ref === ultimo.workoutRef)?.focus : null;
  const feitosRecentes = new Set(e.recentes.slice(-3).map((s) => s.workoutRef));

  const nota = (c: Candidato) => {
    let n = 0;
    if (ultimoFoco && c.focus !== ultimoFoco) n += 4;
    if (!feitosRecentes.has(c.ref)) n += 3;
    if (NIVEL_IDEAL[e.intensidade].includes(c.level)) n += 3;
    else if (e.intensidade === "leve" && c.level === "Avançado") n -= 5;
    if (e.minutosPref) n -= Math.abs(c.minutos - e.minutosPref) / 5;
    // aquecimento e mobilidade não são o treino do dia de quem já treina
    if (c.focus === "Mobilidade") n -= 3;
    return n;
  };
  const ordenados = [...abertos].sort((a, b) => nota(b) - nota(a));
  const melhor = ordenados[0];
  if (!melhor) return null;
  // empate: varia pelo dia, para não repetir sempre o mesmo entre iguais
  const empatados = ordenados.filter((c) => Math.abs(nota(c) - nota(melhor)) < 0.01);
  const escolhido = empatados[e.dia % empatados.length] ?? melhor;

  const partes: string[] = [];
  if (ultimoFoco && escolhido.focus !== ultimoFoco)
    partes.push(`Da última vez foi ${ultimoFoco}; hoje, ${escolhido.focus}`);
  else partes.push(escolhido.focus);
  if (e.minutosPref && Math.abs(escolhido.minutos - e.minutosPref) <= 5)
    partes.push(`${escolhido.minutos} min, no seu tempo`);
  else partes.push(`${escolhido.minutos} min`);
  return { ref: escolhido.ref, motivo: `${partes.join(" · ")}.` };
}
