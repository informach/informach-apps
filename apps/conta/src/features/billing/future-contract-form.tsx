"use client";
import type { activeLegacyFutureIntent } from "@informach/billing/legacy-future-contract";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { useActionState } from "react";
import { type FutureContractFormState, futureContractAction } from "./future-contract-actions";

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));

export function FutureContractForm({
  groupId,
  groupName,
  intent,
  canOffer,
  canCancel,
}: {
  groupId: string | null;
  groupName: string;
  intent: Awaited<ReturnType<typeof activeLegacyFutureIntent>>;
  canOffer: boolean;
  canCancel: boolean;
}) {
  const [state, action, pending] = useActionState<FutureContractFormState, FormData>(
    futureContractAction,
    { ok: false, message: "" },
  );
  const preview = state.preview;
  return (
    <section className="sheet legacy-wallets" aria-label="Continuidade do Compasso">
      <p className="eyebrow">Depois do período atual</p>
      <h3>Continue com o Compasso</h3>
      {intent ? (
        <div className="form-stack">
          <p>
            {intent.state === "scheduled" ? (
              <>
                A próxima assinatura está programada para <strong>{date(intent.startsAt)}</strong>.
              </>
            ) : intent.state === "review" ? (
              "A preparação está em conferência. Você pode acompanhar ou pedir o cancelamento."
            ) : (
              <>
                A preparação respeita o período pago até <strong>{date(intent.paidThrough)}</strong>
                .
              </>
            )}
          </p>
          <p className="small-note">
            {money(intent.amountCents)} {intent.interval === "year" ? "por ano" : "por mês"}, com
            renovação automática após a data programada.
          </p>
          {intent.state === "setup_pending" && (
            <>
              <form action={action} className="form-stack">
                <input type="hidden" name="operation" value="open" />
                <input type="hidden" name="intentId" value={intent.id} />
                <button type="submit" className="secondary" disabled={!canOffer || pending}>
                  Abrir formulário de pagamento
                </button>
              </form>
              <form action={action} className="form-stack">
                <input type="hidden" name="operation" value="confirm" />
                <input type="hidden" name="intentId" value={intent.id} />
                <button type="submit" disabled={!canOffer || pending}>
                  Já concluí o formulário
                </button>
              </form>
            </>
          )}
          {(intent.state === "setup_ready" || intent.state === "scheduling") && (
            <form action={action} className="form-stack">
              <input type="hidden" name="operation" value="schedule" />
              <input type="hidden" name="intentId" value={intent.id} />
              <button type="submit" disabled={!canOffer || pending}>
                Confirmar programação
              </button>
            </form>
          )}
          <form action={action} className="form-stack">
            <input type="hidden" name="operation" value="cancel" />
            <input type="hidden" name="intentId" value={intent.id} />
            <label className="check-label">
              <input type="checkbox" name="confirmed" required disabled={!canCancel || pending} />
              Quero cancelar esta programação. O período já pago será preservado.
            </label>
            <button type="submit" className="secondary" disabled={!canCancel || pending}>
              {pending
                ? "Conferindo…"
                : intent.cancelRequestedAt
                  ? "Conferir cancelamento"
                  : "Cancelar programação"}
            </button>
          </form>
        </div>
      ) : groupId ? (
        <>
          <p>
            Escolha como continuar para {groupName}. A primeira cobrança será depois do último
            período anterior já pago.
          </p>
          <form action={action} className="form-stack">
            <input type="hidden" name="operation" value="preview" />
            <input type="hidden" name="groupId" value={groupId} />
            <label>
              Periodicidade
              <select
                name="productId"
                disabled={!canOffer || pending}
                defaultValue="compasso_monthly"
              >
                <option value="compasso_monthly">
                  Mensal · {money(COMPASSO_POLICY.monthlyAmountCents)}/mês
                </option>
                <option value="compasso_annual">
                  Anual · {money(COMPASSO_POLICY.annualAmountCents)}/ano
                </option>
              </select>
            </label>
            <button type="submit" className="secondary" disabled={!canOffer || pending}>
              {pending
                ? "Conferindo…"
                : preview
                  ? "Atualizar conferência"
                  : "Conferir continuidade"}
            </button>
          </form>
          {preview && (
            <form key={preview.revision} action={action} className="form-stack migration-preview">
              <input type="hidden" name="operation" value="begin" />
              <input type="hidden" name="accountId" value={preview.accountId} />
              <input type="hidden" name="productId" value={preview.productId} />
              <input type="hidden" name="revision" value={preview.revision} />
              <input type="hidden" name="requestKey" value={preview.requestKey} />
              <p>
                Período anterior pago até <strong>{date(preview.paidThrough)}</strong>. A primeira
                cobrança será a partir de <strong>{date(preview.startsAt)}</strong>.
              </p>
              <p>
                Valor da renovação:{" "}
                <strong>
                  {money(preview.amountCents)}{" "}
                  {preview.productId === "compasso_annual" ? "por ano" : "por mês"}
                </strong>
                . O cartão será preparado agora; nenhuma cobrança será feita antes da data indicada.
              </p>
              <label className="check-label">
                <input type="checkbox" name="confirmed" required disabled={!canOffer || pending} />
                Autorizo a assinatura com renovação automática pelo valor e na data acima.
              </label>
              <button type="submit" disabled={!canOffer || pending}>
                {pending ? "Preparando…" : "Continuar para pagamento"}
              </button>
            </form>
          )}
          {!canOffer && (
            <p className="small-note">
              A continuidade será disponibilizada após a preparação da cobrança.
            </p>
          )}
        </>
      ) : (
        <p>Selecione uma família para conferir a continuidade.</p>
      )}
      {state.message && (
        <p role="status" className={state.ok ? "success" : "form-message"}>
          {state.message}
        </p>
      )}
    </section>
  );
}
