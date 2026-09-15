import "server-only";
import { homeSupportFor } from "../content/apoio-em-casa";
import { findCourse, skillNames } from "../content/catalog";
import { repeatedDifficulties, skillStates, weeklyEvidence } from "../learning/engine";
import { weeklyNarrative } from "../learning/relato";
import { getProfiles, history, listFamiliesForWeeklyReport } from "../learning/repository";
import { weekStart } from "./desafio";

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

function escapar(texto: string) {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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
): Promise<ResumoDeFamilia | null> {
  const profiles = await getProfiles(userId);
  if (!profiles.length) return null;
  const blocos: { nome: string; linhas: string[]; apoio: readonly string[] }[] = [];
  for (const profile of profiles) {
    const { evidence, reflections } = await history(userId, profile.id);
    const states = skillStates(evidence);
    const course = findCourse(profile.courseId);
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
      nome: profile.nickname,
      linhas: narrative.linhas,
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
    `Ver o relatório completo: ${appUrl}/familia`,
    rodape,
  ].join("\n");
  const html = [
    `<h1>${escapar(assunto)}</h1>`,
    ...blocos.map((bloco) =>
      [
        `<h2>${escapar(bloco.nome)}</h2>`,
        `<p>${bloco.linhas.map(escapar).join(" ")}</p>`,
        bloco.apoio.length
          ? `<p><strong>Para conversar em casa, sem tela:</strong></p><ul>${bloco.apoio
              .map((ideia) => `<li>${escapar(ideia)}</li>`)
              .join("")}</ul>`
          : "",
      ].join(""),
    ),
    `<p><a href="${escapar(appUrl)}/familia">Ver o relatório completo</a></p>`,
    `<p>${escapar(rodape)}</p>`,
  ].join("");
  return { userId, email, semana, assunto, texto, html };
}

export async function weeklySummaryRecipients() {
  return listFamiliesForWeeklyReport();
}
