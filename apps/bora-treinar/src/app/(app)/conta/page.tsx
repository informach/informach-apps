import { INFORMACH_CONTACT } from "@informach/config/contact";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { otherAppWithData } from "@/features/account/other-apps";
import { ehMotivo, ofertas, reais } from "@/features/billing/ofertas";
import { Cadeado } from "@/features/billing/planos";
import { hasOtherAppSubscriptions } from "@/features/billing/repository";
import { billing, configuredPrice, planChangeMode, products } from "@/features/billing/service";
import {
  AbrirPlanosAoChegar,
  BillingButton,
  Lembretes,
  PlanChangeControls,
  PrivacyControls,
  SairDaConta,
} from "@/features/familia/conta";
import { unsubscribedCategories } from "@/features/familia/repository";
import { currentTrainer } from "@/features/familia/view";
import { diasRestantes, TRIAL_DAYS } from "@/features/teste/regras";
import { getSession } from "@/lib/auth";
import { FUSO_PADRAO } from "@/lib/datas";

export const metadata = { title: "Conta e plano" };

const PLANO = { individual: "Individual", family: "Família" } as Record<string, string>;
const BENEFICIOS = [
  "Todos os treinos prontos, do aquecimento ao HIIT",
  "Contagem pela câmera e celular como câmera da TV",
  "Níveis que acompanham você e o histórico completo",
  "Treinos montados por você e o desafio da semana",
];
/** O que só a Família tem: a mesma assinatura para a casa, cada um no seu perfil. */
const DA_FAMILIA = "Até 4 perfis na mesma assinatura, cada um com o seu treino";

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
        {/* chegou por um cadeado: a folha de planos abre sozinha, com o motivo */}
        {ehMotivo(params.motivo) && !access.subscribed && (
          <AbrirPlanosAoChegar motivo={params.motivo} />
        )}
        {access.trial.active && (
          <div className="card notice">
            <strong>
              Teste grátis: {diasRestantes(access.trial)}{" "}
              {diasRestantes(access.trial) === 1 ? "dia" : "dias"} com tudo liberado.
            </strong>
            <span className="muted">
              Depois volta ao grátis, sem cobrança. Para continuar com tudo, assine abaixo.
            </span>
          </div>
        )}
        {params.pagamento === "recebido" && (
          <div className="card notice">
            {access.subscribed
              ? `Pagamento confirmado. O plano ${PLANO[access.tier] ?? ""} já está valendo.`
              : "Recebemos o retorno do pagamento. A assinatura fica ativa assim que a cobrança for confirmada; atualize a página em instantes."}
          </div>
        )}

        <div className="section-title first">
          <h2>Seu plano</h2>
          <span className="muted">
            {access.subscribed
              ? `${PLANO[access.tier] ?? ""} · até ${access.profileLimit} perfil(is)`
              : problema
                ? "aguardando pagamento"
                : access.trial.active
                  ? "teste grátis"
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
          Grátis: um perfil, o Primeiro treino e o Aquecimento, a biblioteca com o instrutor 3D e a
          prática de cada exercício contando à mão ou pela voz. Sem anúncios.
        </p>
        {!access.subscribed && !access.trial.started && (
          <Cadeado motivo="geral" className="btn primary big spaced">
            Testar {TRIAL_DAYS} dias grátis, sem cartão
          </Cadeado>
        )}
        <div className="grid plans">
          {ofertas(products).map((o) => (
            <div className={`card plan ${access.tier === o.tier ? "current" : ""}`} key={o.tier}>
              <span className="muted">
                {o.tier === "family" ? "Família · até quatro perfis" : "Individual · para você"}
              </span>
              <p className="num plan-price">
                {reais(o.mensal.centavos)}
                <small>/mês</small>
              </p>
              <p className="muted">
                ou {reais(o.anual.porMes)}/mês no anual ({reais(o.anual.centavos)} por ano
                {o.anual.mesesGratis ? `, ${o.anual.mesesGratis} meses grátis` : ""})
              </p>
              <ul className="hint-list">
                {(o.tier === "family" ? [DA_FAMILIA, ...BENEFICIOS] : BENEFICIOS).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {/* assinar não pede login de novo: o pagamento acontece no Stripe */}
              {!bloqueia && (
                <div className="row spaced">
                  <BillingButton
                    productId={o.anual.id}
                    primary
                    disabled={!configuredPrice(o.anual.id)}
                  >
                    Assinar anual
                  </BillingButton>
                  <BillingButton productId={o.mensal.id} disabled={!configuredPrice(o.mensal.id)}>
                    Assinar mensal
                  </BillingButton>
                </div>
              )}
            </div>
          ))}
        </div>
        {bloqueia && !acessoRecente && <ConfirmarAcesso para="mudar ou gerenciar o plano" />}
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
          timezone={family?.timezone ?? FUSO_PADRAO}
        />

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
        <SairDaConta />
        <p className="muted spaced">
          <a href={INFORMACH_CONTACT.directMessageUrl}>Suporte pelo direct do Instagram</a> ·{" "}
          <Link href="/privacidade">Privacidade</Link> · <Link href="/termos">Termos</Link>
        </p>
      </main>
    </div>
  );
}
