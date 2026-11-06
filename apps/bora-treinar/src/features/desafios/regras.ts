import { FATOR, type Intensidade } from "@/features/treino/catalog/workouts";
import { contaComoTreino as contaNoHabito } from "@/features/treino/engine/habito";
import { somarDias } from "@/lib/datas";
import { contribuicao, type Desafio, type SessaoDaSemana } from "./placar";

/**
 * Regras do desafio da semana, sem banco nem tela.
 *
 * O desafio pessoal é de cada perfil e renova sozinho toda segunda: a meta nova sai da semana
 * anterior. O desafio da família é opcional e cooperativo: soma de todos, sem placar de quem fez
 * mais.
 */

/**
 * Meta pessoal de quem ainda não tem histórico: repetições somadas na semana. Com 3 treinos de
 * ~80 repetições (o "Primeiro treino" tem perto disso no nível inicial), "normal" fecha a semana;
 * "leve" e "forte" seguem a mesma proporção das metas dos treinos (70% e 115%), arredondadas.
 */
export const META_PESSOAL_PADRAO: Record<Intensidade, number> = {
  leve: 150,
  normal: 250,
  forte: 350,
};

/** A meta pessoal nunca desce abaixo disso, por mais semanas que passem sem cumprir. */
const PISO_PESSOAL: Record<Intensidade, number> = { leve: 60, normal: 100, forte: 140 };
const TETO = 100_000;

/** Quanto cada perfil carrega do desafio da família: o mesmo fator das metas dos treinos (`buildSteps`). */
export const PESO_DA_INTENSIDADE = FATOR;

/** Quantas semanas passadas o histórico mostra e a renovação olha para trás. */
export const SEMANAS_DE_HISTORICO = 8;

/**
 * Um treino conta para o desafio pela mesma regra do hábito e das conquistas (`habito.ts`): pelo
 * menos 5 repetições (isometria em segundos) ou 1 minuto.
 */
export const contaComoTreino = (sessao: SessaoDaSemana) =>
  contaNoHabito({
    duration: sessao.durationSeconds,
    logs: sessao.logs.map((l) => ({ reps: l.reps, holdSeconds: l.holdSeconds ?? 0 })),
  });

const arredondar5 = (n: number) => Math.round(n / 5) * 5;

/**
 * A meta da semana seguinte: cumpriu, +10%; não cumpriu duas semanas seguidas, −10%; senão,
 * a mesma. `cumpridaAntes` é `null` quando não houve desafio na semana anterior a essa.
 */
export function proximaMeta(
  anterior: Desafio,
  cumprida: boolean,
  cumpridaAntes: boolean | null,
  intensidade: Intensidade,
): Desafio {
  let target = anterior.target;
  if (cumprida) target = Math.max(anterior.target + 1, arredondar5(anterior.target * 1.1));
  else if (cumpridaAntes === false)
    target = Math.max(PISO_PESSOAL[intensidade], arredondar5(anterior.target * 0.9));
  return { ...anterior, target: Math.min(TETO, target) };
}

/** Quanto um perfil fez do desafio numa semana (só treinos que contam). */
export function feitoNaSemana(desafio: Desafio, sessoes: SessaoDaSemana[]) {
  return Math.floor(
    sessoes.filter(contaComoTreino).reduce((t, s) => t + contribuicao(desafio, s), 0),
  );
}

export interface SemanaDoDesafio {
  weekStart: string;
  desafio: Desafio;
}

/**
 * Os desafios pessoais que faltam criar até a semana `atual` (inclusive).
 *
 * Parte do desafio mais recente das últimas 8 semanas e renova semana a semana, com o que o
 * perfil fez em cada uma (`sessoesDaSemana`). As semanas puladas (ninguém abriu o app) também
 * ganham o seu desafio, para que o histórico e a regra das "duas semanas" vejam a semana como foi.
 * Sem nada nas últimas 8 semanas, recomeça da meta padrão da intensidade.
 */
export function desafiosAte(
  atual: string,
  registros: SemanaDoDesafio[],
  sessoesDaSemana: (weekStart: string) => SessaoDaSemana[],
  intensidade: Intensidade,
): SemanaDoDesafio[] {
  const inicio = somarDias(atual, -7 * SEMANAS_DE_HISTORICO);
  const janela = registros
    .filter((r) => r.weekStart >= inicio && r.weekStart <= atual)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const ultimo = janela.at(-1);
  if (!ultimo)
    return [
      {
        weekStart: atual,
        desafio: {
          metric: "repeticoes",
          exerciseId: null,
          target: META_PESSOAL_PADRAO[intensidade],
        },
      },
    ];
  if (ultimo.weekStart === atual) return [];

  const cumprida = (s: SemanaDoDesafio) =>
    feitoNaSemana(s.desafio, sessoesDaSemana(s.weekStart)) >= s.desafio.target;
  const porSemana = new Map(janela.map((r) => [r.weekStart, r]));
  const novos: SemanaDoDesafio[] = [];
  let anterior = ultimo;
  for (
    let semana = somarDias(ultimo.weekStart, 7);
    semana <= atual;
    semana = somarDias(semana, 7)
  ) {
    const antes = porSemana.get(somarDias(anterior.weekStart, -7));
    const novo = {
      weekStart: semana,
      desafio: proximaMeta(
        anterior.desafio,
        cumprida(anterior),
        antes ? cumprida(antes) : null,
        intensidade,
      ),
    };
    novos.push(novo);
    porSemana.set(semana, novo);
    anterior = novo;
  }
  return novos;
}

/** Dias que faltam na semana, contando hoje (segunda = 7, domingo = 1). */
export function diasRestantes(semana: string, hoje: string) {
  const passados = Math.round(
    (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${semana}T00:00:00Z`)) / 86_400_000,
  );
  return Math.max(1, 7 - passados);
}

export interface PerfilDoDesafio {
  id: string;
  name: string;
  color: string;
  intensity: Intensidade;
}

/**
 * O desafio da família, cooperativo: a soma de todos e a parte de cada um, proporcional à
 * intensidade do perfil. Os perfis ficam na ordem da família, nunca do maior para o menor.
 */
export function desafioCooperativo(
  desafio: Desafio,
  sessoes: SessaoDaSemana[],
  perfis: PerfilDoDesafio[],
) {
  const contam = sessoes.filter(contaComoTreino);
  const pesoTotal = perfis.reduce((t, p) => t + PESO_DA_INTENSIDADE[p.intensity], 0) || 1;
  const partes = perfis.map((p) => {
    const valor = feitoNaSemana(
      desafio,
      contam.filter((s) => s.profileId === p.id),
    );
    const parte = Math.max(
      1,
      Math.round((desafio.target * PESO_DA_INTENSIDADE[p.intensity]) / pesoTotal),
    );
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      valor,
      parte,
      progresso: Math.min(1, valor / parte),
    };
  });
  const total = partes.reduce((t, p) => t + p.valor, 0);
  return {
    total,
    concluido: total >= desafio.target,
    progresso: Math.min(1, total / desafio.target),
    partes,
  };
}

export type Cooperativo = ReturnType<typeof desafioCooperativo>;

export type ConferenciaDaMeta = { ok: true; valor: number } | { ok: false; erro: string };

/** Confere a meta digitada só ao salvar: enquanto digita, o campo guarda o texto como está. */
export function conferirMeta(texto: string): ConferenciaDaMeta {
  const limpo = texto.trim().replace(/\./g, "");
  if (!limpo) return { ok: false, erro: "Digite a meta da semana." };
  if (!/^\d+$/.test(limpo)) return { ok: false, erro: "Use só números inteiros na meta." };
  const valor = Number(limpo);
  if (valor < 1) return { ok: false, erro: "A meta precisa ser de pelo menos 1." };
  if (valor > TETO) return { ok: false, erro: "A meta pode ir até 100.000." };
  return { ok: true, valor };
}
