import { INFORMACH_CONTACT } from "@informach/config/contact";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { otherAppWithData } from "@/features/account/other-apps";
import { hasOtherAppSubscriptions } from "@/features/billing/repository";
import { billing, configuredPrice, planChangeMode, products } from "@/features/billing/service";
import {
  BillingButton,
  ImportarEdibody,
  Lembretes,
  PlanChangeControls,
  PrivacyControls,
} from "@/features/familia/conta";
import { unsubscribedCategories } from "@/features/familia/repository";
import { currentTrainer } from "@/features/familia/view";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Conta e plano" };

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PLANO = { individual: "Individual", family: "Família" } as Record<string, string>;
const BENEFICIOS = [
  "Todos os treinos prontos, do aquecimento ao HIIT",
  "Contagem pela câmera e celular como câmera da TV",
  "Níveis que sobem quando a meta é batida",
  "Treinos montados por vocês e desafios em família",
];

function ConfirmarAcesso({ para }: { para: string }) {
  return (
    <div className="card notice">
      <p>
        Para {para}, confirme que é você: entre de novo com seu e-mail. A confirmação vale por dez
        minutos.
      </p>
      <Link href="/entrar?next=%2Fconta" className="btn primary spaced">
        Confirmar acesso
      </Link>
    </div>
  );
}

export default async function Conta({
  searchParams,
}: {
  searchParams: Promise<{ pagamento?: string; motivo?: string }>;
}) {
  const [{ user, access, subscription, family, profiles }, session, params] = await Promise.all([
    currentTrainer(),
    getSession(),
    searchParams,
  ]);
  const acessoRecente =
    !!session && Date.now() - new Date(session.session.createdAt).getTime() < 10 * 60_000;
  const [todas, descadastros] = await Promise.all([
    billing.listSubscriptions({ type: "user", id: user.id }),
    unsubscribedCategories(user.id),
  ]);
  const bloqueia = todas.some((s) =>
    ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(s.status),
  );
  const problema = todas.find((s) => ["past_due", "unpaid", "incomplete"].includes(s.status));
  const atual = products.find((p) => p.id === subscription?.productId);
  const pendente = products.find((p) => p.id === subscription?.pendingProductId);
  const opcoes =
    atual && !subscription?.cancelAtPeriodEnd
      ? products
          .filter((p) => p.id !== atual.id && (!pendente || p.id === pendente.id))
          .map((p) => ({
            id: p.id,
            label: `Mudar para ${PLANO[p.tier ?? ""] ?? p.name} ${p.interval === "year" ? "anual" : "mensal"}`,
            timing: planChangeMode(atual, p),
            requiresRetainedProfile: atual.tier === "family" && p.tier === "individual",
          }))
      : [];

  return (
    <div className="screen">
      <header className="topbar">
        <Link href="/perfis" className="icon-btn" aria-label="Voltar aos perfis">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="page-title">Conta e plano</h1>
      </header>
      <main className="scroll narrow" id="conteudo">
        {params.motivo && !access.paid && (
          <div className="card notice">
            {params.motivo === "editor"
              ? "Montar treinos próprios faz parte da assinatura."
              : "Este treino faz parte da assinatura. O Primeiro treino e a prática de cada exercício continuam gratuitos."}
          </div>
        )}
        {params.pagamento === "recebido" && (
          <div className="card notice">
            {access.paid
              ? `Pagamento confirmado. O plano ${PLANO[access.tier] ?? ""} já está valendo.`
              : "Recebemos o retorno do pagamento. A assinatura fica ativa assim que a cobrança for confirmada; atualize a página em instantes."}
          </div>
        )}

        <div className="section-title first">
          <h2>Seu plano</h2>
          <span className="muted">
            {access.paid
              ? `${PLANO[access.tier] ?? ""} · até ${access.profileLimit} perfil(is)`
              : problema
                ? "aguardando pagamento"
                : "gratuito"}
          </span>
        </div>
        {problema && (
          <div className="card notice warn-card" role="alert">
            <strong>
              {problema.status === "incomplete"
                ? "A primeira cobrança ainda não foi concluída."
                : "Pagamento pendente."}
            </strong>
            <p className="muted spaced">
              Os treinos da assinatura ficam pausados até a forma de pagamento ser atualizada. O
              histórico continua guardado.
            </p>
            {acessoRecente ? (
              <BillingButton primary>Atualizar forma de pagamento</BillingButton>
            ) : (
              <ConfirmarAcesso para="atualizar o pagamento" />
            )}
          </div>
        )}
        {subscription?.cancelAtPeriodEnd && (
          <p className="muted">Cancelamento agendado para o fim do período pago.</p>
        )}
        {pendente && (
          <p className="muted">
            Depois do período atual, entra o plano {PLANO[pendente.tier ?? ""]}{" "}
            {pendente.interval === "year" ? "anual" : "mensal"}.
          </p>
        )}
        <p className="muted spaced">
          Grátis: um perfil, o Primeiro treino, a biblioteca com o instrutor 3D e a prática de cada
          exercício contando à mão. Sem anúncios.
        </p>
        <div className="grid plans">
          {(["individual", "family"] as const).map((tier) => {
            const mensal = products.find((p) => p.tier === tier && p.interval === "month");
            const anual = products.find((p) => p.tier === tier && p.interval === "year");
            if (!mensal || !anual) return null;
            return (
              <div className={`card plan ${access.tier === tier ? "current" : ""}`} key={tier}>
                <span className="muted">
                  {tier === "family" ? "Família · até quatro perfis" : "Individual · um perfil"}
                </span>
                <p className="num plan-price">
                  {brl(mensal.listPrice?.amountCents ?? 0)}
                  <small>/mês</small>
                </p>
                <p className="muted">
                  ou {brl(anual.listPrice?.amountCents ?? 0)} por ano, cobrados de uma vez
                </p>
                <ul className="hint-list">
                  {BENEFICIOS.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                {!bloqueia && acessoRecente && (
                  <div className="row spaced">
                    <BillingButton
                      productId={mensal.id}
                      primary
                      disabled={!configuredPrice(mensal.id)}
                    >
                      Assinar mensal
                    </BillingButton>
                    <BillingButton productId={anual.id} disabled={!configuredPrice(anual.id)}>
                      Assinar anual
                    </BillingButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!acessoRecente && <ConfirmarAcesso para="assinar, mudar ou gerenciar o plano" />}
        {todas.length > 0 && acessoRecente && (
          <div className="spaced">
            <BillingButton>Gerenciar plano, pagamentos ou cancelamento</BillingButton>
          </div>
        )}
        {atual && acessoRecente && (
          <PlanChangeControls
            options={opcoes}
            profiles={profiles.map(({ id, name, accessEnabled }) => ({ id, name, accessEnabled }))}
            cancelAtPeriodEnd={!!subscription?.cancelAtPeriodEnd}
            hasPendingChange={!!pendente}
          />
        )}

        <div className="section-title">
          <h2>Lembretes e resumo</h2>
        </div>
        <Lembretes
          reminderDays={descadastros.has("bora.reminder") ? 0 : (family?.reminderDays ?? 0)}
          reminderHour={family?.reminderHour ?? 18}
          weeklySummary={
            !descadastros.has("bora.weekly-summary") && (family?.weeklySummary ?? false)
          }
          email={user.email}
        />

        <div className="section-title">
          <h2>EdiBody</h2>
        </div>
        {acessoRecente ? <ImportarEdibody /> : <ConfirmarAcesso para="importar um backup" />}

        <div className="section-title">
          <h2>Seus dados e suas escolhas</h2>
        </div>
        {acessoRecente ? (
          <PrivacyControls
            outrasAssinaturas={await hasOtherAppSubscriptions(user.id)}
            outroAppComDados={await otherAppWithData(user.id)}
          />
        ) : (
          <ConfirmarAcesso para="exportar dados, encerrar o app ou excluir a conta" />
        )}
        <p className="muted spaced">
          <a href={INFORMACH_CONTACT.directMessageUrl}>Suporte pelo direct do Instagram</a> ·{" "}
          <Link href="/privacidade">Privacidade</Link> · <Link href="/termos">Termos</Link>
        </p>
      </main>
    </div>
  );
}
