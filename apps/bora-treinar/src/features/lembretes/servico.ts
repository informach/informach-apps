import "server-only";
import { renderEmailElement } from "@informach/emails";
import { createElement } from "react";
import { getGroupAccess } from "@/features/billing/service";
import { challengeOf } from "@/features/desafios/repository";
import {
  enabledTrainerIds,
  familyService,
  listProfiles,
  progressOf,
} from "@/features/familia/repository";
import { familySessionsSince } from "@/features/sessoes/repository";
import { inicioDaSemana, inicioDoDiaLocal, somarDias } from "@/lib/datas";
import { buildUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { reportError } from "@/lib/observability";
import { oQueEnviar } from "./agenda";
import {
  habitoDoPerfil,
  montarLembrete,
  montarResumo,
  textoLembrete,
  textoResumo,
} from "./conteudo";
import { LembreteEmail, ResumoSemanalEmail } from "./emails";
import {
  familiasComAvisos,
  isCurrentRecipient,
  marcarResumo,
  melhoresAntesDe,
  sessoesSomadasDesde,
} from "./repository";

const LOTE = 200;
const ORCAMENTO_MS = 50_000;

type Resultado = "enviado" | "ignorado" | "falha";

/** Perfis que o plano libera hoje (os bloqueados num downgrade não recebem lembrete). */
async function perfisAtivos(userId: string, groupId: string) {
  const [access, perfis] = await Promise.all([
    getGroupAccess(userId, groupId),
    listProfiles(userId, groupId),
  ]);
  const permitidos = new Set(await enabledTrainerIds(userId, groupId, access.profileLimit));
  return { access, ativos: perfis.filter((p) => permitidos.has(p.id)) };
}

/** Retry inline only while the whole rendered snapshot remains authorized. The next job rebuilds it. */
async function mayDeliverSnapshot(
  userId: string,
  email: string,
  groupId: string,
  profileIds: string[],
) {
  if (!(await isCurrentRecipient(userId, email))) return false;
  const { ativos } = await perfisAtivos(userId, groupId);
  return profileIds.length > 0 && profileIds.every((id) => ativos.some((p) => p.id === id));
}

async function enviarLembrete(
  f: { userId: string; email: string; timezone: string },
  groupId: string,
  data: string,
  agora: Date,
): Promise<Resultado> {
  const { access, ativos } = await perfisAtivos(f.userId, groupId);
  const sessoes = await sessoesSomadasDesde(
    f.userId,
    inicioDoDiaLocal(inicioDaSemana(agora, f.timezone), f.timezone),
    groupId,
  );
  const lembrete = montarLembrete(ativos, sessoes, agora.getTime(), f.timezone, access.unlocked);
  // todos já treinaram hoje (ou não há perfil): nada a lembrar
  if (!lembrete) return "ignorado";
  const unsubscribeUrl = buildUnsubscribeUrl(f.userId, "bora.reminder");
  const { html } = await renderEmailElement(
    createElement(LembreteEmail, {
      linhas: lembrete.linhas,
      sugestao: lembrete.sugestao,
      appUrl: env.NEXT_PUBLIC_APP_URL,
      unsubscribeUrl,
    }),
  );
  const result = await emails.sendEmail({
    to: f.email,
    userId: f.userId,
    category: "bora.reminder",
    authorizeContent: () =>
      mayDeliverSnapshot(
        f.userId,
        f.email,
        groupId,
        ativos.map((p) => p.id),
      ),
    messageKey: `bora:reminder:${f.userId}:${groupId}:${data}`,
    subject: "Hora de treinar!",
    text: textoLembrete(lembrete, env.NEXT_PUBLIC_APP_URL, unsubscribeUrl),
    html,
    unsubscribeUrl,
  });
  return result.ok ? "enviado" : result.status === "skipped" ? "ignorado" : "falha";
}

/** Quantas semanas antes o resumo olha para contar as semanas seguidas com a meta cumprida. */
const SEMANAS_DO_HISTORICO = 52;

async function enviarResumo(
  f: { userId: string; email: string; timezone: string },
  groupId: string,
  semana: { semana: string; anterior: string },
  agora: Date,
): Promise<Resultado> {
  const { access, ativos } = await perfisAtivos(f.userId, groupId);
  if (!ativos.length) return "ignorado";
  const inicio = inicioDoDiaLocal(semana.anterior, f.timezone);
  const [sessoes, historico, melhores, progressos] = await Promise.all([
    familySessionsSince(f.userId, inicio, inicioDoDiaLocal(semana.semana, f.timezone), groupId),
    sessoesSomadasDesde(
      f.userId,
      inicioDoDiaLocal(somarDias(semana.anterior, -7 * SEMANAS_DO_HISTORICO), f.timezone),
      groupId,
    ),
    melhoresAntesDe(f.userId, inicio, groupId),
    // os níveis são da assinatura: sem ela, o resumo não oferece subir
    access.unlocked ? Promise.all(ativos.map((p) => progressOf(f.userId, p.id))) : null,
  ]);
  const allowed = new Set(ativos.map((p) => p.id));
  const daSemana = sessoes
    .filter((s) => allowed.has(s.profileId))
    .map((s) => ({
      profileId: s.profileId,
      durationSeconds: s.duration,
      logs: s.logs,
    }));
  const resumo = montarResumo(
    ativos.map((p, i) => ({
      ...p,
      habito: habitoDoPerfil({
        meta: p.weeklyGoal,
        historico: historico.filter((s) => s.profileId === p.id),
        daSemana: daSemana.filter((s) => s.profileId === p.id),
        melhoresAntes: melhores.get(p.id) ?? new Map(),
        progresso: progressos?.[i] ?? null,
        agora: agora.getTime(),
        fuso: f.timezone,
      }),
    })),
    daSemana,
    access.unlocked ? await challengeOf(f.userId, groupId, semana.anterior) : null,
  );
  const unsubscribeUrl = buildUnsubscribeUrl(f.userId, "bora.weekly-summary");
  const { html } = await renderEmailElement(
    createElement(ResumoSemanalEmail, {
      blocos: resumo.blocos,
      linhaDesafio: resumo.linhaDesafio,
      appUrl: env.NEXT_PUBLIC_APP_URL,
      unsubscribeUrl,
    }),
  );
  const result = await emails.sendEmail({
    to: f.email,
    userId: f.userId,
    category: "bora.weekly-summary",
    authorizeContent: () =>
      mayDeliverSnapshot(
        f.userId,
        f.email,
        groupId,
        ativos.map((p) => p.id),
      ),
    messageKey: `bora:weekly:${f.userId}:${groupId}:${semana.semana}`,
    subject: resumo.treinou ? "A semana de treinos da família" : "Uma semana nova para treinar",
    text: textoResumo(resumo, env.NEXT_PUBLIC_APP_URL, unsubscribeUrl),
    html,
    unsubscribeUrl,
  });
  return result.ok ? "enviado" : result.status === "skipped" ? "ignorado" : "falha";
}

/**
 * Rotina horária: lembretes nos dias e horas escolhidos e o resumo de segunda.
 * Idempotente pela chave de mensagem (família + dia, família + semana); o
 * resumo só é marcado como feito depois de enviado ou dispensado.
 */
export async function rodarLembretes(agora = new Date()) {
  const inicio = Date.now();
  const contagem = { lembretes: 0, resumos: 0, ignorados: 0, falhas: 0, familias: 0 };
  let cursor: string | null = null;
  while (Date.now() - inicio < ORCAMENTO_MS) {
    const lote = await familiasComAvisos(cursor, LOTE);
    if (!lote.length) break;
    for (const f of lote) {
      contagem.familias += 1;
      if (!f.emailVerified) continue;
      const plano = oQueEnviar({ ...f, weeklySummaryWeek: f.weeklySummaryWeek ?? null }, agora);
      try {
        const groups = await familyService.listGroups(f.userId);
        let summaryFailed = false;
        for (const group of groups) {
          if (plano.lembrete) {
            const r = await enviarLembrete(f, group.id, plano.lembrete, agora);
            if (r === "enviado") contagem.lembretes += 1;
            else if (r === "ignorado") contagem.ignorados += 1;
            else contagem.falhas += 1;
          }
          if (plano.resumo) {
            const r = await enviarResumo(f, group.id, plano.resumo, agora);
            if (r === "falha") {
              contagem.falhas += 1;
              summaryFailed = true;
            } else {
              if (r === "enviado") contagem.resumos += 1;
              else contagem.ignorados += 1;
            }
          }
        }
        if (plano.resumo && !summaryFailed) await marcarResumo(f.userId, plano.resumo.semana);
      } catch (error) {
        // uma família com dado quebrado não pode calar as seguintes
        contagem.falhas += 1;
        reportError(error, crypto.randomUUID());
      }
    }
    cursor = lote.at(-1)?.userId ?? null;
    if (lote.length < LOTE) break;
  }
  return contagem;
}
