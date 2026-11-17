"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function EmailChangeForm({ email }: { email: string }) {
  const [step, setStep] = useState<"start" | "current" | "new" | "done">("start");
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [reauthenticate, setReauthenticate] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (step === "start" && newEmail.trim().toLowerCase() === email.toLowerCase()) {
      setMessage("Informe um endereço diferente do e-mail atual.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const result =
        step === "start"
          ? await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" })
          : step === "current"
            ? await authClient.emailOtp.requestEmailChange({ newEmail: newEmail.trim(), otp })
            : await authClient.emailOtp.changeEmail({ newEmail: newEmail.trim(), otp });
      if (result.error) {
        if (result.error.code === "RECENT_AUTHENTICATION_REQUIRED" || result.error.status === 401) {
          setReauthenticate(true);
          setMessage(
            "Entre novamente com sua senha e autenticador, se estiver ativo, para trocar o e-mail.",
          );
        } else
          setMessage(
            "Não foi possível confirmar. Confira o endereço e o código ou reinicie a troca para pedir novos códigos.",
          );
        return;
      }
      setOtp("");
      setStep(step === "start" ? "current" : step === "current" ? "new" : "done");
    } catch {
      setMessage(
        "Não conseguimos conectar agora. Se a confirmação final já foi enviada, tente entrar com o novo e-mail antes de repetir a troca.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="sheet email-change-settings">
      <h3>Trocar e-mail</h3>
      {step === "done" ? (
        <>
          <p role="status">
            E-mail atualizado. Suas entradas web foram encerradas. Use o novo e-mail para entrar
            novamente.
          </p>
          <a href="/entrar">Entrar com o novo e-mail ↗</a>
        </>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <p>
            O endereço acompanha sua conta Informach. Seus perfis, históricos e assinaturas
            continuam na mesma conta.
          </p>
          <p className="small-note">
            Vamos confirmar o endereço atual e o novo. Ao concluir, suas entradas web serão
            encerradas. O contato dos comprovantes permanece na configuração de cobrança.
          </p>
          <label>
            Novo e-mail
            <input
              name="newEmail"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              disabled={!ready || pending || step !== "start"}
            />
          </label>
          {step !== "start" && (
            <>
              <p>
                {step === "current"
                  ? `Digite o código enviado para ${email}.`
                  : `Digite o código enviado para ${newEmail}. Se ele não chegar, confira o endereço ou use outro e-mail.`}
              </p>
              <label>
                {step === "current" ? "Código do e-mail atual" : "Código do novo e-mail"}
                <input
                  name="otp"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  disabled={pending}
                />
              </label>
            </>
          )}
          <button type="submit" disabled={!ready || pending || reauthenticate}>
            {pending
              ? "Confirmando…"
              : step === "start"
                ? "Enviar código ao e-mail atual"
                : step === "current"
                  ? "Confirmar e-mail atual"
                  : "Concluir troca de e-mail"}
          </button>
          {step !== "start" && (
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => {
                setStep("start");
                setOtp("");
                setMessage("");
              }}
            >
              Reiniciar troca
            </button>
          )}
          {reauthenticate && <a href="/entrar">Entrar novamente ↗</a>}
          <p role="status">{message}</p>
        </form>
      )}
    </article>
  );
}
