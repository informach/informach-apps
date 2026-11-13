"use client";
import { useActionState } from "react";
import { type CoordinationFormState, coordinationAction } from "./coordination-actions";

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const day = (value: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(
    new Date(value),
  );

export type CoordinationSummary = {
  state: string;
  amountCents: number | null;
  fromChargeAt: Date | null;
  deferUntil: Date | null;
};

/** The payer's side only. It never shows the other adult's app or contract. */
export function CoordinationForm({
  accountId,
  coordination,
  previewEnabled,
  acceptEnabled,
  declineEnabled,
}: {
  accountId: string;
  coordination: CoordinationSummary;
  previewEnabled: boolean;
  acceptEnabled: boolean;
  declineEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<CoordinationFormState, FormData>(
    coordinationAction,
    { ok: false, message: "" },
  );
  const preview = state.preview;
  if (coordination.state !== "open")
    return (
      <section className="sheet" aria-label="Adiamento da sua cobrança">
        <p className="eyebrow">Próxima cobrança</p>
        <h3>
          {coordination.state === "review"
            ? "Cobrança em conferência"
            : coordination.state === "applied" && coordination.deferUntil
              ? `Próxima cobrança adiada para ${day(coordination.deferUntil)}`
              : "Adiamento em andamento"}
        </h3>
        <p>
          {coordination.state === "review"
            ? "Encontramos algo a conferir nesta cobrança. A nova data ainda precisa ser confirmada."
            : coordination.state === "applied"
              ? "Outro adulto trouxe um período já pago para a família. O valor e o plano continuam os mesmos, e nada foi reembolsado. A troca de plano fica disponível depois da cobrança adiada."
              : "Sua decisão foi registrada. Aguarde a confirmação da nova data antes de considerar a cobrança adiada."}
        </p>
      </section>
    );
  return (
    <section className="sheet" aria-label="Pedido de adiamento da sua cobrança">
      <p className="eyebrow">Próxima cobrança</p>
      <h3>Um adulto da família trouxe um período já pago</h3>
      <p>
        Você pode deixar sua próxima cobrança para depois desse período. Só você decide, e a decisão
        vale apenas para a sua cobrança.
      </p>
      {!state.completed && (
        <>
          <form action={action} className="form-stack">
            <input type="hidden" name="operation" value="preview" />
            <input type="hidden" name="accountId" value={accountId} />
            <button type="submit" className="secondary" disabled={!previewEnabled || pending}>
              {pending ? "Conferindo…" : preview ? "Atualizar prévia" : "Conferir datas"}
            </button>
          </form>
          {preview && (
            <div key={preview.revision} className="form-stack migration-preview">
              <p>
                Sua próxima cobrança de <strong>{money(preview.amountCents)}</strong> passaria de{" "}
                <strong>{day(preview.fromChargeAt)}</strong> para{" "}
                <strong>{day(preview.deferUntil)}</strong>. O valor e o plano não mudam, e nada é
                reembolsado. Até a nova data, a troca de plano fica indisponível; você pode cancelar
                a renovação quando quiser.
              </p>
              <form action={action} className="form-stack">
                <input type="hidden" name="operation" value="accept" />
                <input type="hidden" name="accountId" value={preview.accountId} />
                <input type="hidden" name="revision" value={preview.revision} />
                <input type="hidden" name="requestKey" value={preview.requestKey} />
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="confirmed"
                    required
                    disabled={!acceptEnabled || pending}
                  />
                  Aceito adiar minha próxima cobrança para {day(preview.deferUntil)}.
                </label>
                <button type="submit" disabled={!acceptEnabled || pending}>
                  {pending ? "Confirmando…" : "Adiar minha cobrança"}
                </button>
              </form>
              <form action={action}>
                <input type="hidden" name="operation" value="decline" />
                <input type="hidden" name="accountId" value={preview.accountId} />
                <input type="hidden" name="revision" value={preview.revision} />
                <input type="hidden" name="requestKey" value={preview.requestKey} />
                <button type="submit" className="secondary" disabled={!declineEnabled || pending}>
                  Manter a data atual
                </button>
              </form>
            </div>
          )}
        </>
      )}
      {state.message && (
        <p role="status" className={state.ok ? "success" : "form-message"}>
          {state.message}
        </p>
      )}
    </section>
  );
}
