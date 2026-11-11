"use client";
import { useActionState } from "react";
import { type MigrationFormState, migrationAction } from "./migration-actions";

const number = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const expiry = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value))
    : "Sem vencimento";

export function CreditMigrationForm({
  sourceApp,
  sourceName,
  groupId,
  groupName,
  enabled,
}: {
  sourceApp: string;
  sourceName: string;
  groupId: string;
  groupName: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState<MigrationFormState, FormData>(migrationAction, {
    ok: false,
    message: "",
  });
  const preview = state.preview;
  return (
    <div className="legacy-credit-form">
      {!state.completed && (
        <>
          <form action={action} className="form-stack">
            <input type="hidden" name="operation" value="preview" />
            <input type="hidden" name="sourceApp" value={sourceApp} />
            <input type="hidden" name="groupId" value={groupId} />
            <button type="submit" className="secondary" disabled={!enabled || pending}>
              {pending
                ? "Conferindo…"
                : preview
                  ? "Atualizar prévia"
                  : `Conferir créditos do ${sourceName}`}
            </button>
          </form>
          {preview && (
            <form key={preview.revision} action={action} className="form-stack migration-preview">
              <input type="hidden" name="operation" value="confirm" />
              <input type="hidden" name="sourceApp" value={sourceApp} />
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="revision" value={preview.revision} />
              <div className="migration-equivalence">
                <div>
                  <span>No {sourceName}</span>
                  <strong>{number(preview.sourceAmount)}</strong>
                  <small>créditos antigos disponíveis</small>
                </div>
                <span aria-hidden="true">→</span>
                <div>
                  <span>No Compasso</span>
                  <strong>{number(preview.amount)}</strong>
                  <small>créditos para {groupName}</small>
                </div>
              </div>
              <p>
                Cada crédito antigo corresponde a {preview.multiplier} créditos Compasso, para
                preservar o que você podia fazer com ele. As datas de vencimento continuam as
                mesmas.
              </p>
              {preview.lots.length > 0 && (
                <details>
                  <summary>Ver valores e validade de cada lote</summary>
                  <ul className="financial-list">
                    {preview.lots.map((lot) => (
                      <li key={lot.sourceEntryId}>
                        <div>
                          <strong>
                            {number(lot.sourceAmount)} antigos → {number(lot.amount)} Compasso
                          </strong>
                          <span>{expiry(lot.expiresAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {preview.amount === 0 && (
                <p>
                  Não há créditos disponíveis agora. Concessões futuras dessa carteira passarão a
                  seguir para a família escolhida.
                </p>
              )}
              <p className="small-note">
                A transferência não compra uma assinatura nem cancela contratos. Os créditos
                passarão a ser compartilhados nesta família, inclusive se você sair dela depois.
              </p>
              <label className="check-label">
                <input type="checkbox" name="confirmed" required disabled={!enabled || pending} />
                Quero transferir esta carteira para {groupName}, com os valores e validades acima.
                Entendo que o destino não poderá ser trocado pela conta.
              </label>
              <button type="submit" disabled={!enabled || pending}>
                {pending ? "Confirmando…" : "Transferir para esta família"}
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
