import "server-only";
import { renderEmailElement } from "@informach/emails";
import { createElement } from "react";
import { homeSupportFor } from "../content/apoio-em-casa";
import { resolvedCourse, skillNames } from "../content/catalog";
import { laboratoryReport } from "../labs/runtime/family-report";
import { repeatedDifficulties, skillStates, weeklyEvidence } from "../learning/engine";
import { weeklyNarrative } from "../learning/relato";
import { getProfiles, history, listFamiliesForWeeklyReport } from "../learning/repository";
import { weekStart } from "./desafio";
import { type BlocoResumo, ResumoSemanalEmail } from "./resumo-semanal-email";

/**
 * Resumo semanal por e-mail para o responsável.
 *
 * O corpo é montado na hora do envio, nunca persistido: descreve o estudo de
 * uma criança, e uma retentativa genérica não pode reenviar uma leitura
 * desatualizada. É a mesma regra que o pacote de e-mail aplica aos lembretes
 * da agenda.
 *
 * A chave de mensagem inclui a semana, então o pipeline idempotente garante um
 * envio por família por semana mesmo se o cron rodar várias vezes.
 */

export type ResumoDeFamilia = {
  userId: string;
  email: string;
  semana: string;
  assunto: string;
  texto: string;
  html: string;
};

/** Monta o resumo de uma família. Devolve `null` quando não há o que contar. */
export async function buildWeeklySummary(
  userId: string,
  email: string,
  appUrl: string,
  now: Date,
  unsubscribeUrl?: string,
): Promise<ResumoDeFamilia | null> {
  const profiles = await getProfiles(userId);
  if (!profiles.length) return null;
  const blocos: BlocoResumo[] = [];
  for (const profile of profiles) {
    const { evidence, reflections } = await history(userId, profile.id);
    const states = skillStates(evidence);
    const course = resolvedCourse(profile);
    const nextSkill = course?.skills.find(
      (skillId) => states.find((state) => state.skillId === skillId)?.level !== "independent",
    );
    const repeated = repeatedDifficulties(evidence, now);
    const narrative = weeklyNarrative({
      nickname: profile.nickname,
      evidence,
      weekly: weeklyEvidence(evidence, now),
      states,
      repeatedDifficulties: repeated,
      nextSkillId: nextSkill,
      reflections: reflections.length,
      now,
      skillNames,
    });
    blocos.push({
      id: profile.id,
      nome: profile.nickname,
      linhas: [
        ...narrative.linhas,
        ...(
          await laboratoryReport(userId, profile.id, new Date(`${weekStart(now)}T00:00:00-03:00`))
        ).map(
          (entry) =>
            `Laboratório: ${entry.title}. ${entry.status}. ${entry.summary} Isso não altera a evidência de autonomia.`,
        ),
      ],
      apoio: homeSupportFor(nextSkill ?? repeated[0]?.skillId ?? "") ?? [],
    });
  }
  const semana = weekStart(now);
  const assunto = "Missão Saber · o que aconteceu nesta semana";
  const rodape =
    "Este resumo vai só para a conta do responsável. Nenhum lembrete é enviado ao estudante.";
  const texto = [
    assunto,
    "",
    ...blocos.flatMap((bloco) => [
      bloco.nome,
      ...bloco.linhas,
      ...(bloco.apoio.length ? ["Para conversar em casa, sem tela:", ...bloco.apoio] : []),
      "",
    ]),
    `Ver o relatório completo: ${appUrl}/familia/acompanhamento`,
    rodape,
    ...(unsubscribeUrl ? [`Para não receber mais este resumo: ${unsubscribeUrl}`] : []),
  ].join("\n");
  const { html } = await renderEmailElement(
    createElement(ResumoSemanalEmail, { blocos, appUrl, unsubscribeUrl }),
  );
  return { userId, email, semana, assunto, texto, html };
}

export async function weeklySummaryRecipients(
  input: { week?: string; after?: string; limit?: number } = {},
) {
  return listFamiliesForWeeklyReport(input);
}
