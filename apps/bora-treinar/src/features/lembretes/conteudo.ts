import { type Desafio, descreverDesafio, placar } from "@/features/desafios/placar";

export interface SessaoResumo {
  profileId: string;
  durationSeconds: number;
  logs: { exerciseId: string; reps: number; holdSeconds: number }[];
}

export interface BlocoPerfil {
  id: string;
  nome: string;
  linhas: string[];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Texto do resumo da semana, perfil por perfil. Só números de treino: nada de
 * peso, medida ou comparação entre irmãos além do desafio que a família
 * escolheu.
 */
export function montarResumo(
  perfis: { id: string; name: string; color: string }[],
  sessoes: SessaoResumo[],
  desafio: Desafio | null,
) {
  const blocos: BlocoPerfil[] = perfis.map((p) => {
    const minhas = sessoes.filter((s) => s.profileId === p.id);
    if (!minhas.length)
      return { id: p.id, nome: p.name, linhas: ["Não treinou nesta semana. Bora na próxima?"] };
    const reps = minhas.reduce((t, s) => t + s.logs.reduce((u, l) => u + l.reps, 0), 0);
    const minutos = Math.round(minhas.reduce((t, s) => t + s.durationSeconds, 0) / 60);
    const isometria = minhas.reduce((t, s) => t + s.logs.reduce((u, l) => u + l.holdSeconds, 0), 0);
    return {
      id: p.id,
      nome: p.name,
      linhas: [
        `${plural(minhas.length, "treino", "treinos")}, ${plural(minutos, "minuto", "minutos")} e ${plural(reps, "repetição", "repetições")}.`,
        ...(isometria ? [`${isometria} s de isometria somados.`] : []),
      ],
    };
  });
  const resultado = desafio ? placar(desafio, sessoes, perfis) : null;
  const linhaDesafio =
    desafio && resultado
      ? resultado.concluido
        ? `Desafio da família cumprido: ${descreverDesafio(desafio)} (${resultado.total}).`
        : `Desafio da família: ${resultado.total} de ${desafio.target} em ${descreverDesafio(desafio)}.`
      : null;
  const treinou = blocos.length > 0 && sessoes.length > 0;
  return { blocos, linhaDesafio, treinou };
}

export function textoResumo(
  resumo: ReturnType<typeof montarResumo>,
  appUrl: string,
  unsubscribeUrl?: string,
) {
  return [
    "A semana do Bora Treinar",
    "",
    ...resumo.blocos.flatMap((b) => [b.nome, ...b.linhas, ""]),
    ...(resumo.linhaDesafio ? [resumo.linhaDesafio, ""] : []),
    `Abrir o app: ${appUrl}/perfis`,
    ...(unsubscribeUrl ? [`Para não receber mais este resumo: ${unsubscribeUrl}`] : []),
  ].join("\n");
}

export function textoLembrete(appUrl: string, unsubscribeUrl?: string) {
  return [
    "Hora de treinar!",
    "",
    "Ninguém da família treinou ainda hoje. Dez minutinhos já contam: o Aquecimento 5 minutos ou o Primeiro treino são um bom começo.",
    "",
    `Abrir o app: ${appUrl}/perfis`,
    ...(unsubscribeUrl ? [`Para não receber mais lembretes: ${unsubscribeUrl}`] : []),
  ].join("\n");
}
