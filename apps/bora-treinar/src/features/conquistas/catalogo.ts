import { FUSO_PADRAO, inicioDaSemana, sequenciaDeDias } from "@/lib/datas";

export interface Conquista {
  id: string;
  nome: string;
  descricao: string;
}

export const CONQUISTAS: Conquista[] = [
  { id: "primeiro-treino", nome: "Primeiro passo", descricao: "Concluiu o primeiro treino." },
  { id: "dez-treinos", nome: "Pegou o ritmo", descricao: "Dez treinos concluídos." },
  { id: "cinquenta-treinos", nome: "Hábito formado", descricao: "Cinquenta treinos concluídos." },
  { id: "sequencia-3", nome: "Três dias seguidos", descricao: "Treinou três dias em sequência." },
  { id: "sequencia-7", nome: "Semana cheia", descricao: "Treinou sete dias em sequência." },
  { id: "cem-semana", nome: "Cem na semana", descricao: "Cem repetições numa mesma semana." },
  { id: "mil-repeticoes", nome: "Mil repetições", descricao: "Mil repetições somadas." },
  { id: "um-minuto", nome: "Firme como pedra", descricao: "Segurou uma isometria por 60 s." },
  {
    id: "com-camera",
    nome: "De olho na técnica",
    descricao: "Treinou com a contagem pela câmera.",
  },
  { id: "na-tv", nome: "Treino na TV", descricao: "Usou o celular como câmera da TV." },
  { id: "novo-nivel", nome: "Subiu de nível", descricao: "Avançou de nível numa trilha." },
];

export const conquistaPorId = (id: string) => CONQUISTAS.find((c) => c.id === id);

export interface SessaoResumo {
  startedAt: number;
  mode: "camera" | "manual" | "pareado";
  reps: number;
  bestHold: number;
}

/**
 * Conquistas que o histórico do perfil já garante. A lista inclui a sessão que
 * acabou de ser salva; quem chama grava só as que ainda não existiam.
 * "novo-nivel" é dada ao aceitar a sugestão, não aqui.
 */
export function conquistasMerecidas(
  sessoes: SessaoResumo[],
  agora = Date.now(),
  fuso = FUSO_PADRAO,
): string[] {
  const ids: string[] = [];
  const total = sessoes.length;
  if (total >= 1) ids.push("primeiro-treino");
  if (total >= 10) ids.push("dez-treinos");
  if (total >= 50) ids.push("cinquenta-treinos");
  const sequencia = sequenciaDeDias(
    sessoes.map((s) => s.startedAt),
    agora,
    fuso,
  );
  if (sequencia >= 3) ids.push("sequencia-3");
  if (sequencia >= 7) ids.push("sequencia-7");
  const semana = inicioDaSemana(agora, fuso);
  const repsSemana = sessoes
    .filter((s) => inicioDaSemana(s.startedAt, fuso) === semana)
    .reduce((t, s) => t + s.reps, 0);
  if (repsSemana >= 100) ids.push("cem-semana");
  if (sessoes.reduce((t, s) => t + s.reps, 0) >= 1000) ids.push("mil-repeticoes");
  if (sessoes.some((s) => s.bestHold >= 60)) ids.push("um-minuto");
  if (sessoes.some((s) => s.mode === "camera")) ids.push("com-camera");
  if (sessoes.some((s) => s.mode === "pareado")) ids.push("na-tv");
  return ids;
}
