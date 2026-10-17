"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import type { ReturnPath } from "../../lib/return-path";

type Mode = "login" | "signup" | "verify" | "reset";
const HEADINGS: Record<Mode, { title: string; lede: string }> = {
  login: { title: "Bom te ver de novo.", lede: "A mesma conta vale no site e no Edi Hub." },
  signup: {
    title: "Comece pela sua conta.",
    lede: "Uma conta para as cinco ferramentas. Depois você escolhe o plano.",
  },
  verify: {
    title: "Confirme seu e-mail.",
    lede: "Digite o código de 6 números que enviamos para o seu e-mail.",
  },
  reset: {
    title: "Crie uma senha nova.",
    lede: "Use o código que enviamos para o seu e-mail junto com a senha nova.",
  },
};

export function AuthForm({
  initialMode = "login",
  next = "/conta",
}: {
  initialMode?: "login" | "signup";
  next?: ReturnPath;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [mode, setMode] = useState<Mode>(initialMode);
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
        router.push(next);
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
  function switchTo(target: "login" | "signup") {
    setMode(target);
    setOtp("");
    setMessage("");
  }
  return (
    <section className="auth-form" aria-labelledby="auth-title">
      {mode === "login" || mode === "signup" ? (
        <div className="tabs" role="tablist" aria-label="Acesso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            disabled={busy}
            onClick={() => switchTo("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            disabled={busy}
            onClick={() => switchTo("signup")}
          >
            Criar conta
          </button>
        </div>
      ) : (
        <button
          className="link-button"
          type="button"
          disabled={busy}
          onClick={() => switchTo("login")}
        >
          Voltar para entrar
        </button>
      )}
      <span className="eyebrow">Sua conta Edi</span>
      <h1 id="auth-title" className="display-2">
        {HEADINGS[mode].title}
      </h1>
      <p className="muted">{HEADINGS[mode].lede}</p>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label className="field" htmlFor="nome">
            Nome
            <input
              id="nome"
              className="input"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <label className="field" htmlFor="email">
          E-mail
          <input
            id="email"
            className="input"
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
          <div className="field">
            <div className="field-head">
              <label htmlFor="senha">{mode === "reset" ? "Nova senha" : "Senha"}</label>
              {mode === "login" && (
                <button
                  className="link-button"
                  type="button"
                  disabled={busy || !hydrated}
                  onClick={reset}
                >
                  Esqueci a senha
                </button>
              )}
            </div>
            <input
              id="senha"
              className="input"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        )}
        {(mode === "verify" || mode === "reset") && (
          <label className="field" htmlFor="codigo">
            Código recebido por e-mail
            <input
              id="codigo"
              className="input input--otp"
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
        <p aria-live="polite" className="form-message" role="status">
          {message}
        </p>
        <button
          className="button button--primary button--lg button--block"
          type="submit"
          disabled={busy || !hydrated}
        >
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
      <div className="auth-secondary">
        {mode === "verify" && (
          <button
            className="link-button"
            type="button"
            disabled={busy || resendCoolingDown}
            onClick={resendVerification}
          >
            {resendCoolingDown ? "Aguarde para reenviar" : "Reenviar código de confirmação"}
          </button>
        )}
        {mode === "login" && (
          <button
            className="link-button"
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
      </div>
    </section>
  );
}
