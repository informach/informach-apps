import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { contentUnits } from "@/features/content/catalog";
import { lessonSchema } from "@/features/content/types";
import { contentHash } from "@/features/content/version";
import {
  ContentMaintenanceForm,
  ReportActions,
  ReportedVersionInvalidation,
} from "@/features/content-maintenance/components/maintenance-form";
import {
  contentReports,
  maintenanceHistory,
  reportHistory,
} from "@/features/content-maintenance/repository";
import { isContentManager } from "@/features/content-maintenance/service";
import { contentStates } from "@/features/learning/repository";
import { productMetrics } from "@/features/product-metrics/repository";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";

/* Console interna: denso, neutro e sem elementos lúdicos. */
export default async function ContentMaintenance({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; relatos?: string; paginaRelatos?: string }>;
}) {
  const user = await requirePageUser();
  if (!(await isContentManager(user.id))) notFound();
  const params = await searchParams;
  const rawPage = Number(params.pagina ?? 0);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? Math.min(rawPage, 100000) : 0;
  const reportStatus = params.relatos === "resolvidos" ? "resolved" : "pending";
  const rawReportPage = Number(params.paginaRelatos ?? 0);
  const reportPage =
    Number.isSafeInteger(rawReportPage) && rawReportPage >= 0 ? Math.min(rawReportPage, 100000) : 0;
  const [rows, reportRows, controls, metrics] = await Promise.all([
    maintenanceHistory(page),
    contentReports(reportStatus, reportPage),
    contentStates(),
    productMetrics(env.MISSAO_METRICS_EXCLUDED_EMAILS.split(",")),
  ]);
  const reports = reportRows.slice(0, 50);
  const moreReports = reportRows.length > 50;
  const updates = await reportHistory(reports.map((report) => report.id));
  const history = rows.slice(0, 200);
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <Badge variant="secondary">Manutenção de conteúdo · acesso restrito</Badge>
        <h1 className="mt-2 font-display text-3xl font-semibold text-tinta">
          Conteúdo que merece confiança.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O catálogo publicado fica disponível por padrão. Use este espaço para investigar relatos,
          pausar uma missão com problema e reativá-la depois da correção. Sessões anteriores
          conservam sua versão.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-display text-lg">Uso e assinatura</CardTitle>
          <p className="text-sm text-muted-foreground">
            Contas únicas por marco, com fatos do banco e cobrança. Atualizado em{" "}
            {metrics.generatedAt.toLocaleString("pt-BR")}.
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Famílias no produto", metrics.families],
              ["Primeiro perfil", metrics.firstProfiles],
              ["Primeira missão concluída", metrics.firstMissions],
              ["Checkout iniciado", metrics.checkoutStarted],
              ["Assinatura confirmada", metrics.subscriptionConfirmed],
              [
                "Retorno nos dias 7 a 13",
                `${metrics.returnedWeekTwo} de ${metrics.retentionEligible}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Retorno conta apenas coortes cuja janela de 13 dias terminou. Foram excluídas{" "}
            {metrics.excludedTechnicalAccounts} contas técnicas configuradas. Contagens pequenas
            descrevem uso; não demonstram eficácia ou conversão.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-display text-lg">
            {reportStatus === "resolved" ? "Relatos tratados" : "Relatos pendentes"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pendências são ordenadas por risco e recorrência. Os tratados conservam todo o histórico
            de atendimento e a versão que originou o relato.
          </p>
          <div className="flex flex-wrap gap-3 pt-2 text-sm">
            <Link href="/manutencao" className="font-semibold underline underline-offset-4">
              Ver pendentes
            </Link>
            <Link
              href="/manutencao?relatos=resolvidos"
              className="font-semibold underline underline-offset-4"
            >
              Ver tratados
            </Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {reports.length ? (
            reports.map((report) => (
              <article key={report.id} className="rounded-lg border border-border p-3.5">
                <p className="font-mono text-xs text-muted-foreground">
                  {report.lessonId} v{report.version} · {report.itemId}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={report.priority >= 3 ? "destructive" : "outline"}>
                    {!report.category
                      ? "Relato anterior"
                      : report.category === "possible_error"
                        ? "Possível erro"
                        : report.category === "figure_issue"
                          ? "Problema na figura"
                          : report.category === "app_difficulty"
                            ? "Dificuldade no app"
                            : "Não entendeu"}
                  </Badge>
                  <Badge variant="secondary">{report.recurrence} ocorrência(s)</Badge>
                  <Badge variant="outline">
                    {report.status === "investigating"
                      ? "Em investigação"
                      : report.status === "resolved"
                        ? "Tratado"
                        : "Aberto"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Perfil: {report.profileNickname ?? "contexto anterior à versão atual"} · sessão{" "}
                  {report.sessionId ? report.sessionId.slice(0, 8) : "não registrada"}
                </p>
                <p className="mt-1.5 text-sm">{report.detail || "Sem comentário adicional."}</p>
                <ReportedItemContext snapshot={report.snapshot} itemId={report.itemId} />
                {updates
                  .filter((update) => update.reportId === report.id)
                  .map((update) => (
                    <p key={update.id} className="mt-2 text-xs text-muted-foreground">
                      {update.createdAt.toLocaleString("pt-BR")} ·{" "}
                      {update.status === "investigating" ? "investigação" : "resolução"}:{" "}
                      {update.note}
                    </p>
                  ))}
                {report.sessionId && <ReportedVersionInvalidation reportId={report.id} />}
                {report.status !== "resolved" && (
                  <ReportActions id={report.id} status={report.status} />
                )}
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum relato {reportStatus === "resolved" ? "tratado" : "pendente"}.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {reportPage > 0 && (
              <LinkChapa
                href={`/manutencao?relatos=${reportStatus === "resolved" ? "resolvidos" : "pendentes"}&paginaRelatos=${reportPage - 1}`}
                tom="contorno"
                medida="p"
              >
                Relatos mais recentes
              </LinkChapa>
            )}
            {moreReports && (
              <LinkChapa
                href={`/manutencao?relatos=${reportStatus === "resolved" ? "resolvidos" : "pendentes"}&paginaRelatos=${reportPage + 1}`}
                tom="contorno"
                medida="p"
              >
                Relatos mais antigos
              </LinkChapa>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Histórico de manutenção · página {page + 1}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Os estados atuais abaixo consideram todos os registros. Esta página mostra até 200
            registros do histórico.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {page > 0 && (
            <LinkChapa href={`/manutencao?pagina=${page - 1}`} tom="contorno" medida="p">
              Mais recentes
            </LinkChapa>
          )}
          {rows.length > 200 && (
            <LinkChapa href={`/manutencao?pagina=${page + 1}`} tom="contorno" medida="p">
              Mais antigas
            </LinkChapa>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {contentUnits.map((lesson) => {
          const hash = contentHash(lesson);
          const latest = controls.get(lesson.id);
          const estado = latest?.status === "suspended" ? "Pausada" : "Disponível";
          return (
            <details key={lesson.id} className="rounded-xl border border-border bg-card p-4">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-medium">
                <strong className="font-display">{lesson.title}</strong>
                <span className="text-muted-foreground">v{lesson.version}</span>
                <Badge
                  variant={
                    estado === "Disponível"
                      ? "default"
                      : estado === "Pausada"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {estado}
                </Badge>
              </summary>
              <p className="mt-3 text-sm">{lesson.objective}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{lesson.introduction}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Origem: criação autoral Informach. Direitos: política autoral do projeto;
                referências oficiais somente para estudo de competências. Hash: {hash.slice(0, 16)}.
              </p>
              <div className="mt-4 grid gap-3">
                {lesson.items.map((item) => (
                  <article key={item.id} className="rounded-lg border border-border p-3.5 text-sm">
                    <h4 className="font-semibold">
                      {item.id}: {item.prompt}
                    </h4>
                    {item.type === "choice" ? (
                      <>
                        <p className="mt-1.5">
                          Gabarito: <strong>{item.answer}</strong>
                        </p>
                        <ul className="mt-2 grid gap-1 pl-5 [&>li]:list-disc">
                          {item.options
                            .filter((option) => option !== item.answer)
                            .map((option) => (
                              <li key={option} className="text-muted-foreground">
                                <strong className="text-foreground">{option}</strong>:{" "}
                                {item.misconceptions[option]}
                              </li>
                            ))}
                        </ul>
                      </>
                    ) : item.type === "numeric" ? (
                      <p className="mt-1.5">
                        Gabarito numérico: <strong>{item.grading.value}</strong>{" "}
                        {item.grading.unit?.symbol} · tolerância {item.grading.tolerance}
                      </p>
                    ) : item.type === "ordering" ? (
                      <p className="mt-1.5">
                        Regra de ordenação: <strong>{item.grading.mode}</strong>
                      </p>
                    ) : (
                      <div className="mt-1.5">
                        <p>Reflexão sem nota automática.</p>
                        <p className="mt-1 text-muted-foreground">Exemplo: {item.sampleResponse}</p>
                      </div>
                    )}
                    <p className="mt-1 text-muted-foreground">{item.explanation}</p>
                    <ol className="mt-2 grid gap-1 pl-5 [&>li]:list-decimal">
                      {item.hints.map((hint) => (
                        <li key={hint} className="text-muted-foreground">
                          {hint}
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <ContentMaintenanceForm
                  lessonId={lesson.id}
                  version={lesson.version}
                  hash={hash}
                  itemIds={lesson.items.map((item) => item.id)}
                />
              </div>
              <h3 className="mt-5 font-display font-semibold">Histórico de manutenção</h3>
              <div className="mt-1.5 grid gap-1">
                {history
                  .filter((r) => r.lessonId === lesson.id)
                  .map((r) => (
                    <p key={r.id} className="text-sm text-muted-foreground">
                      {r.createdAt.toLocaleString("pt-BR")} · {r.status} · {r.note}
                    </p>
                  ))}
              </div>
            </details>
          );
        })}
      </div>

      <p className="mt-8 text-sm">
        <Link href="/familia" className="font-medium underline underline-offset-4">
          Voltar à área da família
        </Link>
      </p>
    </div>
  );
}

function ReportedItemContext({ snapshot, itemId }: { snapshot: unknown; itemId: string }) {
  const parsed = lessonSchema.safeParse(snapshot);
  const item = parsed.success
    ? parsed.data.items.find((candidate) => candidate.id === itemId)
    : undefined;
  if (!item)
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        O snapshot desta sessão anterior não está disponível.
      </p>
    );
  const answer =
    item.type === "choice"
      ? item.answer
      : item.type === "numeric"
        ? `${item.grading.value}${item.grading.unit ? ` ${item.grading.unit.symbol}` : ""}`
        : item.type === "ordering"
          ? item.grading.mode === "exact"
            ? item.grading.order.join(" → ")
            : item.grading.constraints
                .map(([before, after]) => `${before} antes de ${after}`)
                .join("; ")
          : item.sampleResponse;
  return (
    <details className="mt-3 rounded-lg border border-border p-3">
      <summary className="cursor-pointer font-semibold">
        Consultar atividade da versão relatada
      </summary>
      <p className="mt-2 text-sm">{item.prompt}</p>
      <p className="mt-2 text-sm">
        <strong>Resposta da versão:</strong> {answer}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{item.explanation}</p>
      <ol className="mt-2 grid gap-1 pl-5 text-sm [&>li]:list-decimal">
        {item.hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ol>
    </details>
  );
}
