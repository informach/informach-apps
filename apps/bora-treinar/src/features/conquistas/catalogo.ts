import {
  contaComoTreino,
  contaPeloVolume,
  historicoDosInstantes,
  META_SEMANAL_PADRAO,
  type MelhorMarca,
  recordesBatidos,
} from "@/features/treino/engine/habito";
import type { SetLog } from "@/features/treino/engine/runner";
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
  {
    id: "semana-cumprida",
    nome: "Meta da semana",
    descricao: "Cumpriu a meta de dias de treino de uma semana.",
  },
  {
    id: "3-semanas",
    nome: "Três semanas firmes",
    descricao: "Cumpriu a meta da semana três semanas seguidas.",
  },
  {
    id: "10-semanas",
    nome: "Dez semanas firmes",
    descricao: "Cumpriu a meta da semana dez semanas seguidas.",
  },
  { id: "cem-semana", nome: "Cem na semana", descricao: "Cem repetições numa mesma semana." },
  { id: "mil-repeticoes", nome: "Mil repetições", descricao: "Mil repetições somadas." },
  { id: "um-minuto", nome: "Firme como pedra", descricao: "Segurou uma isometria por 60 s." },
  {
    id: "recorde-pessoal",
    nome: "Recorde pessoal",
    descricao: "Superou a própria melhor marca num exercício.",
  },
  {
    id: "com-camera",
    nome: "De olho na técnica",
    descricao: "Treinou com a contagem pela câmera.",
  },
  {
    id: "tecnica-limpa",
    nome: "Técnica limpa",
    descricao: "Vinte repetições ou mais pela câmera, sem nenhum aviso de forma.",
  },
  { id: "na-tv", nome: "Treino na TV", descricao: "Usou o celular como câmera da TV." },
  { id: "novo-nivel", nome: "Subiu de nível", descricao: "Avançou de nível numa trilha." },
];

export const conquistaPorId = (id: string) => CONQUISTAS.find((c) => c.id === id);

/** Repetições numa sessão com câmera, sem aviso de forma, para a "Técnica limpa". */
export const TECNICA_LIMPA_REPETICOES = 20;

/** Uma sessão do perfil, já somada no banco (`resumosDoPerfil`). */
export interface SessaoResumo {
  startedAt: number;
  /** segundos */
  duration: number;
  mode: "camera" | "manual" | "pareado";
  reps: number;
  /** segundos de isometria somados */
  holdSeconds: number;
  bestHold: number;
  /** nenhuma série da sessão teve aviso de forma */
  semAvisos: boolean;
}

/** A sessão que acabou de ser salva, com as melhores marcas do perfil sem ela (recorde pessoal). */
export interface SessaoSalva {
  duration: number;
  logs: readonly Pick<SetLog, "exerciseId" | "kind" | "reps" | "holdSeconds">[];
  melhoresAnteriores: ReadonlyMap<string, MelhorMarca>;
}

/**
 * Conquistas que o histórico do perfil já garante. A lista inclui a sessão que acabou de ser
 * salva; quem chama grava só as que ainda não existiam. Sessão que não conta como treino
 * (`contaComoTreino`: menos de 5 repetições e de 1 minuto) não vale para nenhuma conquista.
 * "novo-nivel" é dada ao aceitar a sugestão, não aqui.
 */
export function conquistasMerecidas(
  todas: SessaoResumo[],
  agora = Date.now(),
  fuso = FUSO_PADRAO,
  metaSemanal = META_SEMANAL_PADRAO,
  salva?: SessaoSalva,
): string[] {
  const sessoes = todas.filter((s) => contaPeloVolume(s.reps + s.holdSeconds, s.duration));
  const ids: string[] = [];
  const total = sessoes.length;
  if (total >= 1) ids.push("primeiro-treino");
  if (total >= 10) ids.push("dez-treinos");
  if (total >= 50) ids.push("cinquenta-treinos");
  const instantes = sessoes.map((s) => s.startedAt);
  const sequencia = sequenciaDeDias(instantes, agora, fuso);
  if (sequencia >= 3) ids.push("sequencia-3");
  if (sequencia >= 7) ids.push("sequencia-7");
  // a maior sequência do histórico: quem já tinha as semanas antes desta conquista existir ganha
  const semanas = historicoDosInstantes(instantes, agora, fuso, metaSemanal, 0);
  if (semanas.total >= 1) ids.push("semana-cumprida");
  if (semanas.melhor >= 3) ids.push("3-semanas");
  if (semanas.melhor >= 10) ids.push("10-semanas");
  const semana = inicioDaSemana(agora, fuso);
  const repsSemana = sessoes
    .filter((s) => inicioDaSemana(s.startedAt, fuso) === semana)
    .reduce((t, s) => t + s.reps, 0);
  if (repsSemana >= 100) ids.push("cem-semana");
  if (sessoes.reduce((t, s) => t + s.reps, 0) >= 1000) ids.push("mil-repeticoes");
  if (sessoes.some((s) => s.bestHold >= 60)) ids.push("um-minuto");
  if (
    salva &&
    contaComoTreino(salva) &&
    recordesBatidos(salva.logs, salva.melhoresAnteriores).length
  )
    ids.push("recorde-pessoal");
  if (sessoes.some((s) => s.mode === "camera")) ids.push("com-camera");
  if (sessoes.some((s) => s.mode !== "manual" && s.reps >= TECNICA_LIMPA_REPETICOES && s.semAvisos))
    ids.push("tecnica-limpa");
  if (sessoes.some((s) => s.mode === "pareado")) ids.push("na-tv");
  return ids;
}
