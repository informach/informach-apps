import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@informach/ui/components/table";
import Link from "next/link";
import { Avatar } from "@/components/avatares";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { billing, configuredPrice, planChangeMode, products } from "@/features/billing/service";
import { courses, findCourse, skillNames } from "@/features/content/catalog";
import { isContentManager } from "@/features/content-maintenance/service";
import {
  BillingButton,
  CreateProfile,
  PlanChangeControls,
  PrivacyControls,
  Routine,
} from "@/features/family/components/family-controls";
import { repeatedDifficulties, skillStates, weeklyEvidence } from "@/features/learning/engine";
import { familyReports, history } from "@/features/learning/repository";
import { getSession, requirePageUser } from "@/lib/auth";
import { currentDashboard } from "@/lib/view";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* Pele adulta: mesmos tokens de marca, densidade normal e componentes do
   @informach/ui. Aqui o responsável lê relatório e coloca o cartão — não é
   lugar para sombra sólida nem mascote. */
export default async function Family() {
  const user = await requirePageUser();
  const session = await getSession();
  if (!session || Date.now() - new Date(session.session.createdAt).getTime() >= 10 * 60_000)
    return (
      <section className="mx-auto max-w-lg py-12 text-center">
        <h1 className="font-display text-2xl font-semibold text-tinta">
          Um cuidado com o espaço da família.
        </h1>
        <p className="mt-3 mb-6 text-tinta-suave">
          Para ver relatórios, dados pessoais e assinatura, confirme seu acesso entrando novamente.
          A área fica liberada por dez minutos.
        </p>
        <LinkChapa href="/entrar" medida="g">
          Confirmar acesso do responsável
        </LinkChapa>
      </section>
    );

  const data = await currentDashboard();
  const [allSubscriptions, submittedReports] = await Promise.all([
    billing.listSubscriptions({ type: "user", id: user.id }),
    familyReports(user.id),
  ]);
  const hasSubscriptionRecord = allSubscriptions.length > 0;
  const blockingSubscription = allSubscriptions.some((s) =>
    ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(s.status),
  );
  const reports = await Promise.all(
    data.profiles.map(async (profile) => {
      const { evidence, reflections } = await history(user.id, profile.id);
      const states = skillStates(evidence);
      const course = findCourse(profile.courseId);
      const nextSkill = course?.skills.find(
        (skillId) => states.find((state) => state.skillId === skillId)?.level !== "independent",
      );
      return {
        profile,
        evidence,
        reflections,
        weekly: weeklyEvidence(evidence, new Date()),
        states,
        notStudied:
          course?.skills.filter((skillId) => !states.some((state) => state.skillId === skillId)) ??
          [],
        repeatedDifficulty: repeatedDifficulties(evidence, new Date()),
        nextSkill,
      };
    }),
  );
  const currentProduct = products.find(
    (product) => product.id === data.access.subscription?.productId,
  );
  const pendingProduct = products.find(
    (product) => product.id === data.access.subscription?.pendingProductId,
  );
  const changeOptions =
    currentProduct && !data.access.subscription?.cancelAtPeriodEnd
      ? products
          .filter(
            (product) =>
              product.id !== currentProduct.id &&
              (!pendingProduct || product.id === pendingProduct.id),
          )
          .map((product) => ({
            id: product.id,
            label: `Mudar para ${product.tier === "family" ? "Família" : "Individual"} ${
              product.interval === "year" ? "anual" : "mensal"
            }`,
            timing: planChangeMode(currentProduct, product),
            requiresRetainedProfile:
              currentProduct.tier === "family" && product.tier === "individual",
          }))
      : [];
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <p className="font-display text-sm font-semibold text-tinta-suave">
          Apoio que respeita o ritmo de cada um
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-tinta">
          O aprendizado, mais de perto.
        </h1>
        <p className="mt-2 text-sm text-tinta-suave">
          Conta do responsável: {user.email}. A área da família exige uma confirmação recente de
          acesso.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-tinta">Estudantes da família</h2>
          <Badge variant="secondary">
            {data.profiles.length} perfis salvos · {data.activeProfileIds.length} com estudo
            liberado
          </Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.profiles.map((profile) => (
            <Card key={profile.id}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Avatar id={profile.avatar} tamanho="p" />
                <div className="min-w-0">
                  <CardTitle className="font-display text-base">
                    {profile.nickname} · {profile.grade}º ano
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {findCourse(profile.courseId)?.label}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {!data.activeProfileIds.includes(profile.id)
                    ? "Histórico preservado; o plano atual não inclui novas missões assinadas para este perfil."
                    : "Progresso separado e acessível pelo seletor de estudante."}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        {data.profiles.length < data.access.profileLimit && (
          <div className="mt-5">
            <CreateProfile
              courses={courses.map(({ id, label, grades }) => ({ id, label, grades }))}
            />
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-4 font-display text-xl font-semibold text-tinta">
          O que aconteceu nos últimos sete dias
        </h2>
        <div className="grid gap-5">
          {reports.map(
            ({
              profile,
              weekly,
              states,
              evidence,
              reflections,
              notStudied,
              repeatedDifficulty,
              nextSkill,
            }) => (
              <Card key={profile.id}>
                <CardHeader>
                  <CardTitle className="font-display">{profile.nickname}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {weekly.total} tentativas · {weekly.practiceDays} dias com prática ·{" "}
                    {weekly.withHelp} tentativas com pistas.
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {weekly.total || reflections.length
                      ? "A autonomia abaixo considera primeiras respostas em estratégias variadas, com evidências em mais de um dia. Não é uma classificação de capacidade."
                      : "O relatório começa após as primeiras missões. Avaliações ainda em andamento não entram na devolutiva."}
                  </p>
                  <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                    <p className="rounded-lg border border-border p-3">
                      <strong>Próxima ação:</strong>{" "}
                      {nextSkill
                        ? `continuar ${skillNames[nextSkill] ?? nextSkill}`
                        : "retomar as habilidades conforme as datas de revisão"}
                      .
                    </p>
                    <p className="rounded-lg border border-border p-3">
                      <strong>Reflexões registradas:</strong> {reflections.length}. Elas mostram o
                      raciocínio escrito e não recebem nota automática.
                    </p>
                    <p className="rounded-lg border border-border p-3">
                      <strong>Dificuldades repetidas:</strong>{" "}
                      {repeatedDifficulty.length
                        ? repeatedDifficulty.map((state) => skillNames[state.skillId]).join(", ")
                        : evidence.length
                          ? "nenhuma repetição recente identificada"
                          : "ainda não há uso suficiente para observar"}
                      .
                    </p>
                    <p className="rounded-lg border border-border p-3">
                      <strong>Ainda não estudado:</strong>{" "}
                      {notStudied.length
                        ? notStudied.map((skillId) => skillNames[skillId] ?? skillId).join(", ")
                        : "todas as habilidades da trilha já têm algum registro"}
                      .
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Habilidade</TableHead>
                          <TableHead>Evidência acumulada</TableHead>
                          <TableHead>Próximo passo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {states.map((state) => (
                          <TableRow key={state.skillId}>
                            <TableCell className="font-medium">
                              {skillNames[state.skillId]}
                            </TableCell>
                            <TableCell>
                              {state.independentFamilies} estratégias novas sem pistas ·{" "}
                              {state.level === "independent"
                                ? "autonomia em construção contínua"
                                : "precisa de mais encontros"}
                            </TableCell>
                            <TableCell>
                              Rever em{" "}
                              {state.dueAt.toLocaleDateString("pt-BR", {
                                timeZone: "America/Sao_Paulo",
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <details className="mt-4 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Ver tentativas que sustentam o relatório
                    </summary>
                    <div className="mt-2 grid gap-1.5">
                      {evidence.slice(-12).map((row) => (
                        <p key={`${row.sessionId}:${row.itemId}`} className="text-muted-foreground">
                          <Link
                            href={`/missao/${row.sessionId}`}
                            className="font-medium text-foreground underline underline-offset-4"
                          >
                            {skillNames[row.skillId]} · {row.createdAt.toLocaleDateString("pt-BR")}
                          </Link>
                          : {row.correct ? "acerto" : "próximo passo de aprendizagem"},{" "}
                          {row.helpCount ? "com pistas" : "sem pistas nesta tentativa"}.
                        </p>
                      ))}
                    </div>
                  </details>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </section>

      {data.family && (
        <section className="mb-10">
          <Routine minutes={data.family.dailyMinutes} />
        </section>
      )}

      {submittedReports.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 font-display text-xl font-semibold text-tinta">Relatos enviados</h2>
          <div className="grid gap-3">
            {submittedReports.map((report) => (
              <Card key={report.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {report.status === "resolved"
                        ? "Tratado"
                        : report.status === "investigating"
                          ? "Em investigação"
                          : "Recebido"}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {report.lessonId} v{report.version} · {report.itemId}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-tinta">
                    {report.detail || "Relato enviado sem comentário adicional."}
                  </p>
                  {report.resolution && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Retorno da manutenção: {report.resolution}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 font-display text-xl font-semibold text-tinta">
          Seu plano, com clareza
        </h2>
        <p className="text-sm text-tinta">
          Plano atual:{" "}
          <strong>
            {data.access.tier === "family"
              ? "Família"
              : data.access.tier === "individual"
                ? "Individual"
                : "Explorar gratuito"}
          </strong>
          .{" "}
          {data.access.subscription?.cancelAtPeriodEnd
            ? "Cancelamento agendado para o fim do período pago."
            : ""}
          {pendingProduct
            ? ` Depois, entra o plano ${pendingProduct.tier === "family" ? "Família" : "Individual"} ${
                pendingProduct.interval === "year" ? "anual" : "mensal"
              }.`
            : ""}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Grátis: um perfil, diagnóstico, unidade de frações e laboratórios. As assinaturas incluem
          as trilhas lançadas para o ano escolar, revisões, simulados e relatório. Sem anúncios ou
          créditos de IA.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Trilhas disponíveis: {courses.map((course) => course.label).join(", ")}.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {["individual", "family"].map((tier) => {
            const monthly = products.find((p) => p.tier === tier && p.interval === "month");
            const annual = products.find((p) => p.tier === tier && p.interval === "year");
            if (!monthly || !annual) return null;
            return (
              <Card key={tier}>
                <CardHeader>
                  <CardTitle className="font-display text-base">
                    {tier === "family"
                      ? "Família · até três estudantes"
                      : "Individual · um estudante"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-display text-3xl font-semibold text-tinta">
                    {brl(monthly.listPrice?.amountCents ?? 0)}
                    <span className="text-base font-normal text-muted-foreground">/mês</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ou {brl(annual.listPrice?.amountCents ?? 0)} por ano, cobrados de uma vez.
                  </p>
                  <ul className="mt-4 grid gap-1.5 text-sm text-tinta">
                    {[
                      "Conteúdo autoral e pistas graduais",
                      "Revisão, simulados e acompanhamento",
                      "Histórico preservado após cancelar",
                    ].map((linha) => (
                      <li key={linha} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-verde"
                        />
                        {linha}
                      </li>
                    ))}
                  </ul>
                  {!blockingSubscription && (
                    <div className="mt-5 flex flex-wrap gap-2.5">
                      <BillingButton productId={monthly.id} disabled={!configuredPrice(monthly.id)}>
                        Escolher mensal
                      </BillingButton>
                      <BillingButton productId={annual.id} disabled={!configuredPrice(annual.id)}>
                        Escolher anual
                      </BillingButton>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {hasSubscriptionRecord && (
          <div className="mt-5">
            <BillingButton>Gerenciar plano, pagamentos ou cancelamento</BillingButton>
            <p className="mt-2 text-xs text-muted-foreground">
              Alterações e cancelamento são feitos no portal seguro de cobrança. Uma confirmação de
              checkout não libera acesso antes da confirmação do pagamento.
            </p>
          </div>
        )}
        {currentProduct && (
          <div className="mt-5">
            <PlanChangeControls
              options={changeOptions}
              profiles={data.profiles.map(({ id, nickname, accessEnabled }) => ({
                id,
                nickname,
                accessEnabled,
              }))}
              cancelAtPeriodEnd={!!data.access.subscription?.cancelAtPeriodEnd}
              hasPendingChange={!!pendingProduct}
            />
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-xl font-semibold text-tinta">
          Seus dados e suas escolhas
        </h2>
        <PrivacyControls />
        <p className="mt-4 text-sm text-muted-foreground">
          <a
            href="mailto:contato@casaldevgames.com"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Suporte e solicitações sobre a conta Informach
          </a>{" "}
          ·{" "}
          <Link
            href="/privacidade"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Privacidade
          </Link>
        </p>
      </section>

      {(await isContentManager(user.id)) && (
        <LinkChapa href="/manutencao" tom="contorno">
          Abrir manutenção de conteúdo
        </LinkChapa>
      )}
    </div>
  );
}
