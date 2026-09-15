import { buildWeeklySummary, weeklySummaryRecipients } from "@/features/family/resumo-semanal";
import { buildUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { authorizedJob } from "@/lib/http";
import { reportError } from "@/lib/observability";

/**
 * Resumo semanal do responsável.
 *
 * Idempotente por construção: a chave de mensagem inclui a semana, então o
 * pipeline de e-mail recusa um segundo envio para a mesma família na mesma
 * semana, mesmo que o cron dispare várias vezes. O corpo é montado agora e não
 * é persistido — é dado de criança, e uma retentativa genérica não pode
 * reenviar uma leitura vencida.
 */
export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const now = new Date();
    const destinatarios = await weeklySummaryRecipients();
    let enviados = 0;
    let ignorados = 0;
    let falhas = 0;
    for (const { userId, email } of destinatarios) {
      // Uma família por vez, isolada: um dado quebrado em uma delas não pode
      // calar o resumo de todas as seguintes. A falha é contada e reportada, e
      // a chave por semana faz a próxima passada do cron reenviar só quem ficou
      // sem resumo.
      try {
        const resumo = await buildWeeklySummary(userId, email, env.NEXT_PUBLIC_APP_URL, now);
        if (!resumo) {
          ignorados += 1;
          continue;
        }
        const result = await emails.sendEmail({
          to: email,
          userId,
          category: "missao.weekly-report",
          messageKey: `missao:weekly:${userId}:${resumo.semana}`,
          subject: resumo.assunto,
          text: resumo.texto,
          html: resumo.html,
          unsubscribeUrl: buildUnsubscribeUrl(userId, "missao.weekly-report"),
        });
        if (result.ok) enviados += 1;
        else if (result.status === "skipped") ignorados += 1;
        else falhas += 1;
      } catch (error) {
        falhas += 1;
        reportError(error, crypto.randomUUID());
      }
    }
    return Response.json({ status: "ok", enviados, ignorados, falhas });
  } catch (error) {
    const incident = crypto.randomUUID();
    reportError(error, incident);
    return Response.json({ status: "failed", incident }, { status: 503 });
  }
}
