import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import Link from "next/link";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { otherAppWithData } from "@/features/account/other-apps";
import { hasOtherAppSubscriptions } from "@/features/billing/repository";
import { billing, configuredPrice, planChangeMode, products } from "@/features/billing/service";
import { catalogCourses } from "@/features/content/catalog";
import { isContentManager } from "@/features/content-maintenance/service";
import { getSession, requirePageUser } from "@/lib/auth";
import { listaPtBr } from "@/lib/texto";
import { familyDashboard } from "../view";
import {
  BillingButton,
  PaymentConfirmation,
  PlanChangeControls,
  PrivacyControls,
} from "./family-controls";
import { ConfirmarAcesso } from "./reconfirm";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function AccountPanel({ payment }: { payment?: string }) {
  const user = await requirePageUser("/familia/conta");
  const session = await getSession();
  const acessoRecente =
    !!session && Date.now() - new Date(session.session.createdAt).getTime() < 10 * 60_000;
  const data = await familyDashboard();
  const allSubscriptions = await billing.listSubscriptions({ type: "user", id: user.id });
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
    <div>
      {payment === "recebido" && (
        <PaymentConfirmation
          paid={data.access.paid}
          plano={data.access.tier === "family" ? "Família" : "Individual"}
        />
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
                <LinkChapa href="/entrar?next=%2Ffamilia%2Fconta" medida="p">
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
