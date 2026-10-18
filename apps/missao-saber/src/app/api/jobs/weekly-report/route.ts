import { z } from "zod";
import { weekStart } from "@/features/family/desafio";
import { buildWeeklySummary, weeklySummaryRecipients } from "@/features/family/resumo-semanal";
import { completeWeeklyReport } from "@/features/learning/repository";
import { buildUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { authorizedJob } from "@/lib/http";
import { recordJobResponse } from "@/lib/job-runs";
import { packageLogger, reportError } from "@/lib/observability";

const WEEKLY_REPORT_BATCH_SIZE = 20;
const querySchema = z.object({
  after: z.string().min(1).max(128).optional(),
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

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
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ status: "invalid_cursor" }, { status: 400 });
  // O registro em ops.job_runs conta como falha qualquer resposta de erro (503 com
  // falhas de entrega, 409 de semana trocada), sem mudar a resposta do cron.
  return recordJobResponse("weekly-report", async () => {
    try {
      const now = new Date();
      const started = Date.now();
      const semana = weekStart(now);
      if (parsed.data.week && parsed.data.week !== semana)
        return Response.json({ status: "week_changed" }, { status: 409 });
      const destinatarios = await weeklySummaryRecipients({
        week: semana,
        after: parsed.data.after,
        limit: WEEKLY_REPORT_BATCH_SIZE + 1,
      });
      let enviados = 0;
      let ignorados = 0;
      let falhas = 0;
      let processed = 0;
      for (const { userId, email } of destinatarios.slice(0, WEEKLY_REPORT_BATCH_SIZE)) {
        if (processed > 0 && Date.now() - started >= 45_000) break;
        processed += 1;
        // Uma família por vez, isolada: um dado quebrado em uma delas não pode
        // calar o resumo de todas as seguintes. A falha é contada e reportada, e
        // a chave por semana faz a passada de terça do cron reenviar só quem
        // ficou sem resumo na segunda.
        try {
          const unsubscribeUrl = buildUnsubscribeUrl(userId, "missao.weekly-report");
          const resumo = await buildWeeklySummary(
            userId,
            email,
            env.NEXT_PUBLIC_APP_URL,
            now,
            unsubscribeUrl,
          );
          if (!resumo) {
            await completeWeeklyReport(userId, semana);
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
            unsubscribeUrl,
          });
          if (result.ok || result.status === "skipped") {
            await completeWeeklyReport(userId, semana);
            if (result.ok) enviados += 1;
            else ignorados += 1;
          } else falhas += 1;
        } catch (error) {
          falhas += 1;
          reportError(error, crypto.randomUUID());
        }
      }
      // O cron observa o status HTTP. Entregas que retornam failed/deferred também
      // precisam acionar o alerta, preservando as contagens e a retentativa da semana.
      const nextCursor =
        processed < destinatarios.length ? (destinatarios[processed - 1]?.userId ?? null) : null;
      const durationMs = Date.now() - started;
      packageLogger.info("weekly_report.batch_completed", {
        processed,
        enviados,
        ignorados,
        falhas,
        durationMs,
      });
      return Response.json(
        {
          status: falhas ? "failed" : "ok",
          enviados,
          ignorados,
          falhas,
          processed,
          durationMs,
          semana,
          nextCursor,
          done: !nextCursor,
        },
        {
          status: falhas ? 503 : 200,
          headers: {
            "x-report-week": semana,
            "x-next-cursor": nextCursor ? encodeURIComponent(nextCursor) : "",
          },
        },
      );
    } catch (error) {
      const incident = crypto.randomUUID();
      reportError(error, incident);
      return Response.json({ status: "failed", incident }, { status: 503 });
    }
  });
}
