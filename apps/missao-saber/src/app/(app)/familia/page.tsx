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
import { otherAppWithData } from "@/features/account/other-apps";
import { hasOtherAppSubscriptions } from "@/features/billing/repository";
import { billing, configuredPrice, planChangeMode, products } from "@/features/billing/service";
import { homeSupportFor } from "@/features/content/apoio-em-casa";
import {
  catalogCourses,
  catalogGrades,
  courseLine,
  resolvedCourse,
  skillNames,
  suggestedCourses,
} from "@/features/content/catalog";
import { isContentManager } from "@/features/content-maintenance/service";
import {
  BillingButton,
  CreateProfile,
  EditProfile,
  FamilyChallenge,
  PaymentConfirmation,
  PlanChangeControls,
  PrivacyControls,
  Routine,
  WeeklyReportEmail,
} from "@/features/family/components/family-controls";
import { suggestedGoal } from "@/features/family/desafio";
import { birthMonthValue, gradeLabel, gradeOptions } from "@/features/family/school-year";
import { repeatedDifficulties, skillStates, weeklyEvidence } from "@/features/learning/engine";
import { weeklyNarrative } from "@/features/learning/relato";
import { familyReports, history, weeklyReportUnsubscribed } from "@/features/learning/repository";
import { getSession, requirePageUser } from "@/lib/auth";
import { listaPtBr } from "@/lib/texto";
import { currentDashboard } from "@/lib/view";

const escolhasDeTrilha = suggestedCourses.map((course) => ({
  id: course.id,
  label: course.label,
  grades: course.grades,
  line: courseLine(course),
}));
const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* Pele adulta: mesmos tokens de marca, densidade normal e componentes do
   @informach/ui. Aqui o responsável lê relatório e coloca o cartão — não é
   lugar para sombra sólida nem mascote. */
/* Ler o relatório e ajustar preferências vale com a sessão normal do
   responsável. O que mexe em dinheiro, dados pessoais ou perfis pede um login
   feito há menos de dez minutos; as actions conferem isso de novo no servidor. */
function ConfirmarAcesso({ para }: { para: string }) {
  return (
    <div className="rounded-card border-2 border-sombra bg-creme p-4">
      <p className="font-display font-semibold text-tinta">Um cuidado com o espaço da família.</p>
      <p className="mt-1 text-sm text-tinta-suave">
        Para {para}, confirme seu acesso entrando novamente. A confirmação vale por dez minutos.
      </p>
      <div className="mt-3">
        <LinkChapa href="/entrar" medida="p">
          Confirmar acesso do responsável
        </LinkChapa>
      </div>
    </div>
  );
}

export const metadata = { title: "Família" };

export default async function Family({
  searchParams,
}: {
  searchParams: Promise<{ pagamento?: string }>;
}) {
  const user = await requirePageUser();
  const session = await getSession();
  const acessoRecente =
    !!session && Date.now() - new Date(session.session.createdAt).getTime() < 10 * 60_000;
  const { pagamento } = await searchParams;

  const data = await currentDashboard();
  const [allSubscriptions, submittedReports, cancelouResumo] = await Promise.all([
    billing.listSubscriptions({ type: "user", id: user.id }),
    familyReports(user.id),
    weeklyReportUnsubscribed(user.id),
  ]);
  const challenge = data.challenge;
  const hasSubscriptionRecord = allSubscriptions.length > 0;
  const blockingSubscription = allSubscriptions.some((s) =>
    ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(s.status),
  );
  /* Cobrança recusada ou primeira cobrança não concluída: o acesso Pro cai
     (past_due não é Pro), mas a família precisa ver o motivo e o caminho, não
     um "Explorar gratuito" sem explicação. */
  const paymentIssue = allSubscriptions.find((s) =>
    ["past_due", "unpaid", "incomplete"].includes(s.status),
  );
  const paymentIssueProduct = products.find((p) => p.id === paymentIssue?.productId);
  const paymentIssuePlan = paymentIssueProduct?.tier === "family" ? "Família" : "Individual";
  const reports = await Promise.all(
    data.profiles.map(async (profile) => {
      const { evidence, reflections } = await history(user.id, profile.id);
      const states = skillStates(evidence);
      const course = resolvedCourse(profile);
      const nextSkill = course?.skills.find(
        (skillId) => states.find((state) => state.skillId === skillId)?.level !== "independent",
      );
      const now = new Date();
      const weekly = weeklyEvidence(evidence, now);
      const repeatedDifficulty = repeatedDifficulties(evidence, now);
      return {
        profile,
        evidence,
        reflections,
        weekly,
        states,
        notStudied:
          course?.skills.filter((skillId) => !states.some((state) => state.skillId === skillId)) ??
          [],
        repeatedDifficulty,
        nextSkill,
        /* O apoio acompanha a habilidade do próximo passo; sem próximo passo,
           acompanha a dificuldade repetida mais recente. */
        support: homeSupportFor(nextSkill ?? repeatedDifficulty[0]?.skillId ?? ""),
        narrative: weeklyNarrative({
          nickname: profile.nickname,
          evidence,
          weekly,
          states,
          repeatedDifficulties: repeatedDifficulty,
          nextSkillId: nextSkill,
          reflections: reflections.length,
          now,
          skillNames,
        }),
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
          Conta do responsável: {user.email}. Assinatura, dados pessoais e perfis pedem uma
          confirmação recente de acesso.
        </p>
      </header>

      {pagamento === "recebido" && (
        <PaymentConfirmation
          paid={data.access.paid}
          plano={data.access.tier === "family" ? "Família" : "Individual"}
        />
      )}

      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-tinta">Estudantes da família</h2>
          <Badge variant="secondary">
            {data.profiles.length === 1
              ? "1 perfil salvo"
              : `${data.profiles.length} perfis salvos`}{" "}
            · {data.activeProfileIds.length} com estudo liberado
          </Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.profiles.map((profile) => (
            <Card key={profile.id}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Avatar id={profile.avatar} tamanho="p" />
                <div className="min-w-0">
                  <CardTitle className="font-display text-base">
                    {profile.nickname} · {gradeLabel(profile.grade)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{resolvedCourse(profile)?.label}</p>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {!data.activeProfileIds.includes(profile.id)
                    ? "Histórico preservado; o plano atual não inclui novas missões assinadas para este perfil."
                    : "Progresso separado e acessível pelo seletor de estudante."}
                </p>
                {acessoRecente && (
                  <EditProfile
                    profile={{
                      id: profile.id,
                      nickname: profile.nickname,
                      avatar: profile.avatar,
                      grade: profile.grade,
                      birthMonth: birthMonthValue(profile.birthMonth),
                      courseId: resolvedCourse(profile)?.id ?? profile.courseId,
                    }}
                    courses={escolhasDeTrilha}
                    grades={gradeOptions(catalogGrades)}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        {acessoRecente ? (
          data.profiles.length < data.access.profileLimit && (
            <div className="mt-5">
              <CreateProfile courses={escolhasDeTrilha} grades={gradeOptions(catalogGrades)} />
            </div>
          )
        ) : (
          <div className="mt-5">
            <ConfirmarAcesso
              para={
                data.profiles.length < data.access.profileLimit
                  ? "editar ou criar perfis"
                  : "editar os perfis"
              }
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
              narrative,
              support,
            }) => (
              <Card key={profile.id}>
                <CardHeader>
                  <CardTitle className="font-display">{profile.nickname}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {weekly.total === 1 ? "1 tentativa" : `${weekly.total} tentativas`} ·{" "}
                    {weekly.practiceDays === 1
                      ? "1 dia com prática"
                      : `${weekly.practiceDays} dias com prática`}{" "}
                    · {weekly.withHelp === 1 ? "1 com pista" : `${weekly.withHelp} com pistas`}.
                  </p>
                </CardHeader>
                <CardContent>
                  {/* A leitura da semana em frases, antes dos números. Composta
                      por regras a partir da mesma evidência que a tabela abaixo
                      exibe — nenhum adjetivo de capacidade, nenhuma alegação de
                      domínio. */}
                  <div className="mb-4 grid gap-1.5 rounded-lg border-2 border-verde/35 bg-verde-claro p-4">
                    {narrative.linhas.map((linha) => (
                      <p key={linha} className="text-[0.975rem] leading-relaxed text-tinta">
                        {linha}
                      </p>
                    ))}
                  </div>
                  {/* Apoio em casa: a única parte do relatório que pede tela
                      nenhuma. Vem da habilidade do próximo passo, para a
                      conversa acompanhar o que está sendo construído. */}
                  {support && (
                    <div className="mb-4 rounded-lg border border-border p-4">
                      <p className="font-display font-semibold text-tinta">
                        Como apoiar em casa, sem tela
                      </p>
                      <ul className="mt-2 grid gap-1.5 pl-5 text-sm text-tinta [&>li]:list-disc">
                        {support.map((ideia) => (
                          <li key={ideia}>{ideia}</li>
                        ))}
                      </ul>
                    </div>
                  )}
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
        <section className="mb-10 grid gap-5">
          <FamilyChallenge
            goal={challenge.goal}
            suggested={suggestedGoal(data.profiles.length)}
            progress={challenge.progress}
            contributions={challenge.contributions}
          />
          <Routine minutes={data.family.dailyMinutes} />
          {/* Cancelar pelo link do e-mail não mexe na coluna da família, então
              o estado mostrado é o efetivo: ligado só quando as duas coisas
              concordam. */}
          <WeeklyReportEmail
            enabled={data.family.weeklyReportEmail && !cancelouResumo}
            canceladoPeloEmail={cancelouResumo}
            email={user.email}
          />
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
        {paymentIssue && (
          <div
            role="alert"
            className="mb-4 rounded-card border-2 border-coral-fundo/40 bg-coral-claro p-4"
          >
            <p className="font-display font-semibold text-tinta">
              {paymentIssue.status === "incomplete"
                ? "A primeira cobrança ainda não foi concluída."
                : "Pagamento pendente."}
            </p>
            <p className="mt-1 text-sm text-tinta">
              {paymentIssue.status === "incomplete"
                ? `A assinatura ${paymentIssuePlan} fica ativa assim que o pagamento for concluído.`
                : `A última cobrança da assinatura ${paymentIssuePlan} não foi aprovada. As trilhas assinadas ficam pausadas até a forma de pagamento ser atualizada; o histórico continua guardado.`}
            </p>
            <div className="mt-3">
              {acessoRecente ? (
                <BillingButton>Atualizar forma de pagamento</BillingButton>
              ) : (
                <LinkChapa href="/entrar" medida="p">
                  Confirmar acesso para atualizar o pagamento
                </LinkChapa>
              )}
            </div>
          </div>
        )}
        <p className="text-sm text-tinta">
          Plano atual:{" "}
          <strong>
            {data.access.tier === "family"
              ? "Família"
              : data.access.tier === "individual"
                ? "Individual"
                : paymentIssue
                  ? "Aguardando pagamento"
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
          Grátis: um perfil, o diagnóstico, as primeiras missões de cada trilha e os laboratórios.
          As assinaturas incluem todas as missões das trilhas do ano escolar, as revisões e os
          simulados. Sem anúncios nem créditos de IA.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Trilhas disponíveis: {listaPtBr(catalogCourses.map((course) => course.label))}.
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
                  {!blockingSubscription && acessoRecente && (
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
        {!acessoRecente && (
          <div className="mt-5">
            <ConfirmarAcesso para="assinar, alterar ou gerenciar o plano" />
          </div>
        )}
        {hasSubscriptionRecord && acessoRecente && (
          <div className="mt-5">
            <BillingButton>Gerenciar plano, pagamentos ou cancelamento</BillingButton>
            <p className="mt-2 text-xs text-muted-foreground">
              Alterações e cancelamento são feitos no portal seguro de cobrança. Uma confirmação de
              checkout não libera acesso antes da confirmação do pagamento.
            </p>
          </div>
        )}
        {currentProduct && acessoRecente && (
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
        {acessoRecente ? (
          <PrivacyControls
            outrasAssinaturas={await hasOtherAppSubscriptions(user.id)}
            outroAppComDados={await otherAppWithData(user.id)}
          />
        ) : (
          <ConfirmarAcesso para="exportar dados, encerrar o app ou excluir a conta" />
        )}
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
