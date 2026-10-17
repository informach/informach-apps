"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "verify" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCoolingDown, setResendCoolingDown] = useState(false);
  useEffect(() => {
    if (!resendCoolingDown) return;
    const timer = window.setTimeout(() => setResendCoolingDown(false), 60000);
    return () => window.clearTimeout(timer);
  }, [resendCoolingDown]);
  async function resendVerification() {
    if (busy || resendCoolingDown) return;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Preencha um e-mail válido primeiro.");
      return;
    }
    setBusy(true);
    setResendCoolingDown(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (result.error) {
        setMessage(
          result.error.status === 429
            ? "Muitas solicitações. Aguarde antes de pedir outro código."
            : "Não foi possível enviar o código. Tente novamente mais tarde.",
        );
        return;
      }
      setOtp("");
      setMessage(
        "Se houver uma conta pendente neste e-mail, você receberá um novo código. Use o código mais recente.",
      );
    } catch {
      setMessage("Não foi possível conectar ao serviço de conta.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const result = await authClient.signUp.email({ email, password, name });
        if (result.error) {
          setMessage(result.error.message ?? "Não foi possível criar a conta.");
          return;
        }
        setMode("verify");
        setResendCoolingDown(true);
        setMessage("Enviamos um código para confirmar seu e-mail.");
      } else if (mode === "verify") {
        const result = await authClient.emailOtp.verifyEmail({ email, otp });
        if (result.error) {
          setMessage(result.error.message ?? "Confira o código.");
          return;
        }
        setMode("login");
        setMessage("E-mail confirmado. Entre para continuar.");
      } else if (mode === "reset") {
        const result = await authClient.emailOtp.resetPassword({ email, otp, password });
        if (result.error) {
          setMessage(result.error.message ?? "Confira o código e a nova senha.");
          return;
        }
        setMode("login");
        setMessage("Senha atualizada. Entre novamente.");
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          if (result.error.code === "EMAIL_NOT_VERIFIED") {
            setMode("verify");
            setOtp("");
            setPassword("");
            setMessage(
              "Confirme seu e-mail para entrar. Digite o código recebido ou solicite um novo abaixo.",
            );
            return;
          }
          setMessage(result.error.message ?? "Confira seu e-mail e senha.");
          return;
        }
        router.push("/conta");
        router.refresh();
      }
    } catch {
      setMessage("Não foi possível conectar. Confira sua conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!email) {
      setMessage("Preencha seu e-mail primeiro.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.forgetPassword.emailOtp({ email });
      if (result.error) {
        setMessage(result.error.message ?? "Não foi possível solicitar o código.");
        return;
      }
      setMode("reset");
      setMessage("Se a conta existir, você receberá um código para redefinir a senha.");
    } catch {
      setMessage("Não foi possível conectar ao serviço de conta.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-panel">
      <span className="eyebrow">Sua conta Edi</span>
      <h1>
        {mode === "signup"
          ? "Comece pela sua conta."
          : mode === "verify"
            ? "Confirme seu e-mail."
            : mode === "reset"
              ? "Uma nova senha."
              : "Bom ter você aqui."}
      </h1>
      <p className="muted">Uma conta para toda a sua bancada criativa.</p>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label htmlFor="nome">
            Nome
            <input
              id="nome"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <label htmlFor="email">
          E-mail
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setOtp("");
            }}
          />
        </label>
        {mode !== "verify" && (
          <label htmlFor="senha">
            {mode === "reset" ? "Nova senha" : "Senha"}
            <input
              id="senha"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        {(mode === "verify" || mode === "reset") && (
          <label htmlFor="codigo">
            Código recebido por e-mail
            <input
              id="codigo"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
            />
          </label>
        )}
        <p aria-live="polite" className="small" role="status">
          {message}
        </p>
        <button type="submit" disabled={busy}>
          {busy
            ? "Aguarde…"
            : mode === "signup"
              ? "Criar conta"
              : mode === "verify"
                ? "Confirmar e-mail"
                : mode === "reset"
                  ? "Atualizar senha"
                  : "Entrar"}
        </button>
      </form>
      <div className="actions section">
        {mode === "verify" ? (
          <button
            className="secondary"
            type="button"
            disabled={busy || resendCoolingDown}
            onClick={resendVerification}
          >
            {resendCoolingDown ? "Aguarde para reenviar" : "Reenviar código de confirmação"}
          </button>
        ) : (
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setMode("verify");
              setOtp("");
              setPassword("");
              setMessage(
                "Digite seu e-mail e o código recebido. Se ele expirou, solicite um novo abaixo.",
              );
            }}
          >
            Confirmar cadastro pendente
          </button>
        )}
        {mode === "verify" && (
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setMode("login");
              setOtp("");
              setMessage("");
            }}
          >
            Voltar para entrar
          </button>
        )}
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setMessage("");
          }}
        >
          {mode === "signup" ? "Já tenho uma conta" : "Criar uma conta"}
        </button>
        <button className="secondary" type="button" disabled={busy} onClick={reset}>
          Esqueci a senha
        </button>
      </div>
    </section>
  );
}
