import "server-only";
import { renderEmailElement } from "@informach/emails";
import { createElement } from "react";
import { getAccess } from "@/features/billing/service";
import { challengeOf } from "@/features/desafios/repository";
import { allowedProfileIds } from "@/features/familia/profile-access";
import { listProfiles } from "@/features/familia/repository";
import { familySessionsSince } from "@/features/sessoes/repository";
import { inicioDoDiaLocal } from "@/lib/datas";
import { buildUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { reportError } from "@/lib/observability";
import { oQueEnviar } from "./agenda";
import { montarResumo, textoLembrete, textoResumo } from "./conteudo";
import { LembreteEmail, ResumoSemanalEmail } from "./emails";
import { familiasComAvisos, marcarResumo, treinouDesde } from "./repository";

const LOTE = 200;
const ORCAMENTO_MS = 50_000;

type Resultado = "enviado" | "ignorado" | "falha";

async function enviarLembrete(
  f: { userId: string; email: string; timezone: string },
  data: string,
) {
  if (await treinouDesde(f.userId, inicioDoDiaLocal(data, f.timezone))) return "ignorado";
  const unsubscribeUrl = buildUnsubscribeUrl(f.userId, "bora.reminder");
  const { html } = await renderEmailElement(
    createElement(LembreteEmail, { appUrl: env.NEXT_PUBLIC_APP_URL, unsubscribeUrl }),
  );
  const result = await emails.sendEmail({
    to: f.email,
    userId: f.userId,
    category: "bora.reminder",
    messageKey: `bora:reminder:${f.userId}:${data}`,
    subject: "Hora de treinar!",
    text: textoLembrete(env.NEXT_PUBLIC_APP_URL, unsubscribeUrl),
    html,
    unsubscribeUrl,
  });
  return result.ok ? "enviado" : result.status === "skipped" ? "ignorado" : "falha";
}

async function enviarResumo(
  f: { userId: string; email: string; timezone: string },
  semana: { semana: string; anterior: string },
): Promise<Resultado> {
  const [access, perfis] = await Promise.all([getAccess(f.userId), listProfiles(f.userId)]);
  const permitidos = new Set(allowedProfileIds(perfis, access.profileLimit));
  const ativos = perfis.filter((p) => permitidos.has(p.id));
  const sessoes = await familySessionsSince(
    f.userId,
    inicioDoDiaLocal(semana.anterior, f.timezone),
    inicioDoDiaLocal(semana.semana, f.timezone),
  );
  const resumo = montarResumo(
    ativos,
    sessoes.map((s) => ({ profileId: s.profileId, durationSeconds: s.duration, logs: s.logs })),
    access.paid ? await challengeOf(f.userId, semana.anterior) : null,
  );
  if (!ativos.length) return "ignorado";
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
    messageKey: `bora:weekly:${f.userId}:${semana.semana}`,
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
        if (plano.lembrete) {
          const r = await enviarLembrete(f, plano.lembrete);
          if (r === "enviado") contagem.lembretes += 1;
          else if (r === "ignorado") contagem.ignorados += 1;
          else contagem.falhas += 1;
        }
        if (plano.resumo) {
          const r = await enviarResumo(f, plano.resumo);
          if (r === "falha") contagem.falhas += 1;
          else {
            if (r === "enviado") contagem.resumos += 1;
            else contagem.ignorados += 1;
            await marcarResumo(f.userId, plano.resumo.semana);
          }
        }
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
