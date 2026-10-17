"use client";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
export function DeviceApproval() {
  const [code, setCode] = useState("");
  const [review, setReview] = useState<{ client: string; scope: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function inspect(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setReview(null);
    setMessage("");
    try {
      const result = await authClient.device({ query: { user_code: code } });
      if (result.error) {
        setMessage("Entre na conta e confira o código exibido no seu computador.");
        return;
      }
      if (!result.data.client_id) {
        setMessage("Entre na sua conta antes de aprovar este computador.");
        return;
      }
      setReview({ client: result.data.client_id, scope: result.data.scope ?? "" });
    } catch {
      setMessage("Não foi possível verificar o código.");
    } finally {
      setBusy(false);
    }
  }
  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const result = approve
        ? await authClient.device.approve({ userCode: code })
        : await authClient.device.deny({ userCode: code });
      if (result.error) {
        setMessage("Não foi possível concluir a aprovação.");
        return;
      }
      setReview(null);
      setMessage(
        approve ? "Computador autorizado. Pode voltar ao aplicativo Edi." : "Solicitação negada.",
      );
    } catch {
      setMessage("Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-panel">
      <span className="eyebrow">Conta → computador</span>
      <h1>Conecte sua bancada.</h1>
      <p className="muted">
        Digite o código mostrado pelo Edi Hub ou pela ferramenta. Aprove somente uma solicitação que
        você iniciou.
      </p>
      <form onSubmit={inspect}>
        <label htmlFor="user-code">
          Código do aplicativo
          <input
            id="user-code"
            name="user_code"
            autoComplete="off"
            maxLength={32}
            required
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setReview(null);
            }}
          />
        </label>
        <button type="submit" disabled={busy}>
          Conferir solicitação
        </button>
      </form>
      {review && (
        <div className="notice">
          <strong>Solicitação: {review.client}</strong>
          <p className="small">Permissões: {review.scope}</p>
          <p className="small">
            Acesso à licença e ao gerenciamento deste dispositivo, sem acesso administrativo à sua
            conta.
          </p>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => decide(true)}>
              Autorizar computador
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => decide(false)}
            >
              Negar
            </button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
