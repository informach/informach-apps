"use client";
import { useActionState } from "react";
import { type LegacyContractFormState, legacyContractAction } from "./legacy-contract-actions";

export function LegacyContractForm({
  groupId,
  groupName,
  subscriptionId,
  enabled,
}: {
  groupId: string;
  groupName: string;
  subscriptionId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState<LegacyContractFormState, FormData>(
    legacyContractAction,
    { ok: false, message: "" },
  );
  const preview = state.preview;
  const end = preview
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(preview.endsAt))
    : "";
  return (
    <div className="legacy-credit-form">
      {!state.completed && (
        <>
          <form action={action} className="form-stack">
            <input type="hidden" name="operation" value="preview" />
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="subscriptionId" value={subscriptionId} />
            <button type="submit" className="secondary" disabled={!enabled || pending}>
              {pending ? "Conferindo…" : preview ? "Atualizar prévia" : "Conferir contrato"}
            </button>
          </form>
          {preview && (
            <form key={preview.revision} action={action} className="form-stack migration-preview">
              <input type="hidden" name="operation" value="confirm" />
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="subscriptionId" value={subscriptionId} />
              <input type="hidden" name="revision" value={preview.revision} />
              <input type="hidden" name="coordination" value={preview.coordination} />
              <p>
                Período pago até <strong>{end}</strong>. Após o aceite, o acesso será compartilhado
                com {groupName} enquanto esse período estiver válido.
              </p>
              <p>
                {preview.cancellationScheduled
                  ? "A renovação anterior já está encerrada ou programada para terminar."
                  : "A renovação anterior será encerrada ao fim do período já pago."}{" "}
                Nenhuma assinatura nova será cobrada agora, e não há reembolso do período já pago.
              </p>
              {preview.coordination === "payer_decides" && (
                <p>
                  Outro adulto já paga o Compasso desta família. Quem paga decide se a própria
                  próxima cobrança fica para depois do seu período pago. O seu aceite não depende
                  dessa decisão.
                </p>
              )}
              <label className="check-label">
                <input type="checkbox" name="confirmed" required disabled={!enabled || pending} />
                Aceito migrar este contrato para {groupName} e encerrar sua renovação anterior,
                preservando o período pago.
              </label>
              <button type="submit" disabled={!enabled || pending}>
                {pending ? "Confirmando…" : "Confirmar migração"}
              </button>
            </form>
          )}
        </>
      )}
      {state.message && (
        <p role="status" className={state.ok ? "success" : "form-message"}>
          {state.message}
        </p>
      )}
    </div>
  );
}
