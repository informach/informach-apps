"use client";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { EDI_TOOLS } from "@informach/config/edi-tools";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SuiteBars, ToolIcon } from "../../components/site/brand";
import {
  CheckIcon,
  DownloadIcon,
  ExternalIcon,
  MinusIcon,
  MonitorIcon,
  PlusIcon,
  ShieldIcon,
} from "../../components/site/icons";
import type { SuitePlan, suitePricing } from "../billing/pricing";
import { billingPortalAction, checkoutAction, deactivateDeviceAction } from "./actions";
import type { AccountView as Account } from "./presenter";

type Pricing = ReturnType<typeof suitePricing>;

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
      router.refresh();
    } catch {
      setMessage("Não foi possível concluir. Tente novamente em instantes.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, run };
}

export function AccountView({
  account,
  billingReady,
  pricing,
  initialPlan,
  checkout,
  deviceLimit,
  offlineHours,
}: {
  account: Account;
  billingReady: boolean;
  pricing: Pricing;
  initialPlan: SuitePlan;
  checkout: "success" | "canceled" | null;
  /** Limites do contrato desktop, lidos no servidor. */
  deviceLimit: number;
  offlineHours: number;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const action = useAction();
  const { subscription } = account;
  const firstVisit = subscription.kind === "none" && !subscription.returning;
  return (
    <>
      <div className="account-head">
        <div>
          <span className="eyebrow">Minha conta</span>
          <h1 className="display-1">
            {firstVisit ? "Boas-vindas" : "Olá"}, {account.user.name}.
          </h1>
          <p className="mono muted account-head__email">{account.user.email}</p>
        </div>
      </div>

      {checkout === "success" && subscription.kind !== "active" && (
        <div className="notice notice--ok notice--spaced" role="status">
          <CheckIcon size={20} />
          <p>
            <strong>Pagamento recebido.</strong> A assinatura aparece aqui assim que a confirmação
            chegar, em alguns instantes.{" "}
            <button
              type="button"
              className="link-button"
              disabled={!hydrated}
              onClick={() => router.refresh()}
            >
              Atualizar agora
            </button>
          </p>
        </div>
      )}
      {checkout === "canceled" && subscription.kind !== "active" && (
        <p className="notice notice--spaced" role="status">
          Pagamento não concluído. Nada foi cobrado. Quando quiser, é só escolher o plano de novo.
        </p>
      )}

      {firstVisit && <Onboarding billingReady={billingReady} />}

      <div className="account-grid">
        {subscription.kind === "none" ? (
          <PlanPicker
            pricing={pricing}
            initialPlan={initialPlan}
            billingReady={billingReady}
            emailVerified={account.user.emailVerified}
            returning={subscription.returning}
            action={action}
            deviceLimit={deviceLimit}
            offlineHours={offlineHours}
          />
        ) : (
          <SubscriptionPanel
            subscription={subscription}
            pricing={pricing}
            billingReady={billingReady}
            hasBillingHistory={account.hasBillingHistory}
            action={action}
          />
        )}
        <DevicesPanel devices={account.devices} deviceLimit={deviceLimit} />
      </div>
      <p role="status" aria-live="polite" className="form-message form-message--error">
        {action.message}
      </p>

      <section className="panel panel--mat mat" aria-labelledby="ferramentas">
        <div className="panel__intro">
          <h2 id="ferramentas" className="display-3">
            Suas cinco ferramentas
          </h2>
          <p>Elas são instaladas, abertas e atualizadas pelo Edi Hub, no seu computador.</p>
          <Link className="button button--primary" href="/downloads">
            <DownloadIcon size={18} />
            Baixar o Edi Hub
          </Link>
        </div>
        <ul className="mini-tools">
          {EDI_TOOLS.map((tool) => (
            <li key={tool.id}>
              <ToolIcon tool={tool.id} size="sm" />
              <strong>{tool.name}</strong>
            </li>
          ))}
        </ul>
      </section>

      <div className="account-grid">
        <section className="panel panel--outline" aria-labelledby="arquivos">
          <ShieldIcon size={28} />
          <h2 id="arquivos" className="display-4">
            Seus arquivos ficam com você
          </h2>
          <p className="muted">
            Os projetos ficam no seu computador. Se a assinatura acabar, nada é apagado.
          </p>
        </section>
        <section className="panel panel--outline" aria-labelledby="ajuda">
          <h2 id="ajuda" className="display-4">
            Precisa de ajuda?
          </h2>
          <ul className="help-links">
            <li>
              <Link href={{ pathname: "/", hash: "perguntas" }}>Como trocar de computador</Link>
            </li>
            <li>
              <Link href={{ pathname: "/downloads", hash: "aviso-windows" }}>
                O Windows mostrou um alerta na instalação
              </Link>
            </li>
            <li>
              <Link href="/conectar">Conectar um computador novo</Link>
            </li>
            <li>
              <a href={INFORMACH_CONTACT.directMessageUrl}>Falar com a gente no Instagram</a>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}

function Onboarding({ billingReady }: { billingReady: boolean }) {
  // Na fase piloto ainda não dá para assinar: o passo atual passa a ser o Hub,
  // que já pode ser baixado e conectado.
  return (
    <ol className="onboarding" aria-label="Seus próximos passos">
      <li className="is-done">
        <span className="onboarding__mark">
          <CheckIcon size={16} />
        </span>
        <span>
          <strong>Conta criada</strong>
          <span className="onboarding__sub">e-mail confirmado</span>
        </span>
      </li>
      <li
        className={billingReady ? "is-current" : undefined}
        aria-current={billingReady ? "step" : undefined}
      >
        <span className="onboarding__mark">2</span>
        <span>
          <strong>Escolha o plano</strong>
          <span className="onboarding__sub">
            {billingReady ? "você está aqui" : "abre quando a homologação terminar"}
          </span>
        </span>
      </li>
      <li
        className={billingReady ? undefined : "is-current"}
        aria-current={billingReady ? undefined : "step"}
      >
        <span className="onboarding__mark">3</span>
        <span>
          <strong>Baixe o Edi Hub</strong>
          <span className="onboarding__sub">um arquivo para Windows</span>
        </span>
      </li>
      <li>
        <span className="onboarding__mark">4</span>
        <span>
          <strong>Conecte o computador</strong>
          <span className="onboarding__sub">com um código de 8 letras</span>
        </span>
      </li>
    </ol>
  );
}

type Action = ReturnType<typeof useAction>;

function PlanPicker({
  pricing,
  initialPlan,
  billingReady,
  emailVerified,
  returning,
  action,
  deviceLimit,
  offlineHours,
}: {
  pricing: Pricing;
  initialPlan: SuitePlan;
  billingReady: boolean;
  emailVerified: boolean;
  returning: boolean;
  action: Action;
  deviceLimit: number;
  offlineHours: number;
}) {
  const hydrated = useHydrated();
  const [plan, setPlan] = useState<SuitePlan>(initialPlan);
  const productId = plan === "anual" ? pricing.annual.productId : pricing.monthly.productId;
  return (
    <section className="panel panel--offer" aria-labelledby="plano">
      <h2 id="plano" className="display-3">
        {returning ? "Volte para a bancada" : "Suíte Edi completa"}
      </h2>
      <p className="muted">
        As mesmas cinco ferramentas nos dois planos. Muda só a forma de pagar.
      </p>
      {!billingReady && (
        <p className="notice notice--warn">
          <span>
            <strong>As assinaturas abrem quando a homologação terminar.</strong> Nenhuma cobrança é
            feita aqui por enquanto. Você já pode <Link href="/downloads">baixar o Edi Hub</Link> e
            conectar o computador; as ferramentas abrem quando a assinatura começar.
          </span>
        </p>
      )}
      <fieldset className="plan-options">
        <legend>Forma de pagamento</legend>
        <label className="plan-option" htmlFor="plano-mensal">
          <input
            id="plano-mensal"
            type="radio"
            name="plano"
            value="mensal"
            checked={plan === "mensal"}
            onChange={() => setPlan("mensal")}
          />
          <span className="plan-option__text">
            <span>
              <strong>Mensal</strong>
              <span className="plan-option__sub">Cobrança todo mês. Cancele quando quiser.</span>
            </span>
            <span className="plan-option__price">
              <b>{pricing.monthly.price}</b>
              <span className="plan-option__sub">por mês</span>
            </span>
          </span>
        </label>
        <label className="plan-option" htmlFor="plano-anual">
          <input
            id="plano-anual"
            type="radio"
            name="plano"
            value="anual"
            checked={plan === "anual"}
            onChange={() => setPlan("anual")}
          />
          <span className="plan-option__text">
            <span>
              <strong>
                Anual{" "}
                <span className="badge">{pricing.annual.freeMonths} meses por nossa conta</span>
              </strong>
              <span className="plan-option__sub">
                Sai por {pricing.annual.perMonth} ao mês. Economia de {pricing.annual.savings}.
              </span>
            </span>
            <span className="plan-option__price">
              <b>{pricing.annual.price}</b>
              <span className="plan-option__sub">por ano</span>
            </span>
          </span>
        </label>
      </fieldset>
      {billingReady ? (
        <>
          <button
            type="button"
            className="button button--primary button--lg button--block"
            disabled={!hydrated || action.busy || !emailVerified}
            onClick={() => action.run(() => checkoutAction(productId))}
          >
            {action.busy
              ? "Abrindo o pagamento…"
              : plan === "anual"
                ? `Assinar por ${pricing.annual.price} ao ano`
                : `Assinar por ${pricing.monthly.price} ao mês`}
          </button>
          <p className="price-card__note">
            {emailVerified
              ? "Você vai para a página segura da Stripe e volta para cá ao terminar."
              : "Confirme seu e-mail para assinar. Use o código que enviamos ao criar a conta."}
          </p>
        </>
      ) : (
        <button type="button" className="button button--lg button--block button--quiet" disabled>
          Assinaturas em breve
        </button>
      )}
      <ul className="check-list small">
        <li>
          <CheckIcon size={16} />
          EdiAula, EdiCaptura, EdiFoto, EdiPDF e EdiSVG
        </li>
        <li>
          <CheckIcon size={16} />
          Até {deviceLimit} computadores, todas as atualizações e uso sem internet por até{" "}
          {offlineHours} horas
        </li>
        <li className="check-list__excluded">
          <MinusIcon size={16} />
          Consumo de IA não incluso: use a sua conta
        </li>
      </ul>
    </section>
  );
}

function SubscriptionPanel({
  subscription,
  pricing,
  billingReady,
  hasBillingHistory,
  action,
}: {
  subscription: Exclude<Account["subscription"], { kind: "none" }>;
  pricing: Pricing;
  billingReady: boolean;
  hasBillingHistory: boolean;
  action: Action;
}) {
  const hydrated = useHydrated();
  const portalDisabled = !hydrated || action.busy || !billingReady;
  const openPortal = () => action.run(billingPortalAction);
  if (subscription.kind === "payment_required")
    return (
      <section className="panel panel--card" aria-labelledby="assinatura">
        <div className="panel__head">
          <span className="status-pill status-pill--stop">Pagamento pendente</span>
          <SuiteBars />
        </div>
        <h2 id="assinatura" className="display-3">
          Falta confirmar o pagamento.
        </h2>
        <p className="muted">
          O último pagamento não foi confirmado. Atualize o cartão para voltar a abrir as
          ferramentas. Seus arquivos continuam no computador.
        </p>
        <div className="actions">
          <button
            type="button"
            className="button button--primary"
            disabled={portalDisabled}
            onClick={openPortal}
          >
            Atualizar pagamento
            <ExternalIcon size={16} />
          </button>
        </div>
      </section>
    );
  if (subscription.kind === "suspended")
    return (
      <section className="panel panel--card" aria-labelledby="assinatura">
        <div className="panel__head">
          <span className="status-pill status-pill--stop">Acesso suspenso</span>
          <SuiteBars />
        </div>
        <h2 id="assinatura" className="display-3">
          O acesso desta conta está suspenso.
        </h2>
        <p className="muted">
          Isso acontece depois de um reembolso ou de uma contestação de pagamento. Seus arquivos
          continuam no computador.
        </p>
        {hasBillingHistory && (
          <div className="actions">
            <button
              type="button"
              className="button button--outline"
              disabled={portalDisabled}
              onClick={openPortal}
            >
              Ver faturas
              <ExternalIcon size={16} />
            </button>
          </div>
        )}
      </section>
    );
  return (
    <section className="panel panel--card" aria-labelledby="assinatura">
      <div className="panel__head">
        {subscription.ending ? (
          <span className="status-pill status-pill--warn">Cancelamento agendado</span>
        ) : (
          <span className="status-pill status-pill--ok">Assinatura ativa</span>
        )}
        <SuiteBars />
      </div>
      <h2 id="assinatura" className="display-3">
        {subscription.ending
          ? "A bancada fica liberada até o fim do período."
          : "Sua bancada está liberada."}
      </h2>
      <dl className="facts">
        {subscription.planLabel && (
          <div>
            <dt>PLANO</dt>
            <dd>{subscription.planLabel}</dd>
          </div>
        )}
        <div>
          <dt>{subscription.dateLabel.toLocaleUpperCase("pt-BR")}</dt>
          <dd>{subscription.date}</dd>
        </div>
      </dl>
      <div className="actions">
        <button
          type="button"
          className="button button--outline"
          disabled={portalDisabled}
          onClick={openPortal}
        >
          Faturas, cartão e cancelamento
          <ExternalIcon size={16} />
        </button>
      </div>
      {subscription.monthly && !subscription.ending && billingReady && (
        <div className="upsell">
          <p>
            <strong>Passe para o anual e economize {pricing.annual.savings}.</strong> Você paga{" "}
            {pricing.annual.paidMonths} meses e usa 12. A troca é confirmada na página da Stripe.
          </p>
          <button
            type="button"
            className="button button--primary button--sm"
            disabled={portalDisabled}
            onClick={openPortal}
          >
            Mudar para o anual
          </button>
        </div>
      )}
    </section>
  );
}

function DevicesPanel({
  devices,
  deviceLimit,
}: {
  devices: Account["devices"];
  deviceLimit: number;
}) {
  const hydrated = useHydrated();
  const action = useAction();
  const [confirming, setConfirming] = useState<string | null>(null);
  const free = Math.max(deviceLimit - devices.length, 0);
  return (
    <section className="panel" aria-labelledby="computadores">
      <span className="eyebrow">Computadores</span>
      <h2 id="computadores" className="display-3">
        {devices.length} de {deviceLimit} conectados
      </h2>
      <span className="slot-bar" aria-hidden="true">
        {devices.map((device) => (
          <span key={device.id} className="is-used" />
        ))}
        {Array.from({ length: free }, (_, slot) => `livre-${slot}`).map((slot) => (
          <span key={slot} />
        ))}
      </span>
      <ul className="device-list">
        {devices.map((device) => (
          <li key={device.id} className="device">
            <div className="device__row">
              <MonitorIcon size={28} />
              <span className="device__name">
                <strong>{device.name}</strong>
                <span>{device.lastSeen}</span>
              </span>
              {confirming !== device.id && (
                <button
                  type="button"
                  className="button button--danger button--sm"
                  disabled={!hydrated || action.busy}
                  onClick={() => setConfirming(device.id)}
                >
                  Desconectar
                </button>
              )}
            </div>
            {confirming === device.id && (
              <div className="device__confirm">
                <p>
                  Desconectar este computador? Para voltar a usar a suíte nele, será preciso um novo
                  código do Edi Hub. Os arquivos dele não são tocados.
                </p>
                <span className="actions">
                  <button
                    type="button"
                    className="button button--danger-solid button--sm"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => {
                        await deactivateDeviceAction(device.id);
                        setConfirming(null);
                      })
                    }
                  >
                    {action.busy ? "Desconectando…" : "Sim, desconectar"}
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--sm"
                    disabled={action.busy}
                    onClick={() => setConfirming(null)}
                  >
                    Cancelar
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
        {Array.from({ length: free }, (_, slot) => `vaga-${slot}`).map((slot) => (
          <li key={slot} className="device device--free">
            <PlusIcon size={28} />
            <span>
              <strong>Vaga livre</strong>
              <span>No outro computador, abra o Edi Hub e clique em Conectar minha conta.</span>
            </span>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="form-message form-message--error">
        {action.message}
      </p>
    </section>
  );
}
