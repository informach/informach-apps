"use client";
import { webSsoReturnUrl } from "@informach/auth/web-sso-contract";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "signup" | "verify" | "reset" | "totp" | "recovery";
const headings: Record<Mode, string> = {
  login: "Uma conta. Seu lugar.",
  signup: "Vamos começar?",
  verify: "Confira seu e-mail.",
  reset: "Uma nova senha.",
  totp: "Mais uma confirmação.",
  recovery: "Seu código de recuperação.",
};
export function AuthForm({
  destination,
  environment,
}: {
  destination: string;
  environment: "production" | "development";
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const secondFactor = mode === "totp" || mode === "recovery";
  function continueToAccount(data: unknown) {
    const url =
      typeof data === "object" && data !== null && "url" in data && typeof data.url === "string"
        ? data.url
        : null;
    window.location.assign(url ? webSsoReturnUrl(url, environment) : destination);
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (secondFactor) {
        const result =
          mode === "totp"
            ? await authClient.twoFactor.verifyTotp({ code: otp, trustDevice: false })
            : await authClient.twoFactor.verifyBackupCode({ code: otp, trustDevice: false });
        if (result.error) {
          setMessage(
            "Não conseguimos confirmar. Confira o código; após várias tentativas, aguarde antes de tentar de novo.",
          );
          return;
        }
        setOtp("");
        continueToAccount(result.data);
      } else if (mode === "signup") {
        const result = await authClient.signUp.email({ email, password, name });
        if (result.error) {
          setMessage(
            result.error.code === "USER_ALREADY_EXISTS"
              ? "Você já tem uma conta. Entre com seu e-mail e senha."
              : "Não foi possível criar a conta. Confira os dados e tente novamente.",
          );
          return;
        }
        setMode("verify");
        setMessage("Enviamos um código de 6 números. Use-o para confirmar seu e-mail.");
      } else if (mode === "verify") {
        const result = await authClient.emailOtp.verifyEmail({ email, otp });
        if (result.error) {
          setMessage("Código inválido ou vencido. Confira o e-mail ou peça outro código.");
          return;
        }
        setMode("login");
        setOtp("");
        setPassword("");
        setMessage("E-mail confirmado. Entre com sua senha para continuar.");
      } else if (mode === "reset") {
        const result = await authClient.emailOtp.resetPassword({ email, otp, password });
        if (result.error) {
          setMessage("Não conseguimos alterar a senha. Confira o código e tente novamente.");
          return;
        }
        setMode("login");
        setOtp("");
        setPassword("");
        setMessage("Senha atualizada. Entre para continuar.");
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          if (result.error.code === "EMAIL_NOT_VERIFIED") {
            setMode("verify");
            setMessage("Confirme seu e-mail para continuar.");
          } else
            setMessage(
              result.error.status === 429
                ? "Muitas tentativas. Aguarde um pouco antes de tentar de novo."
                : "Não conseguimos entrar. Confira seu e-mail e sua senha.",
            );
          return;
        }
        if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
          setMode("totp");
          setOtp("");
          setPassword("");
          setMessage("Abra seu aplicativo autenticador e digite os 6 números.");
          return;
        }
        continueToAccount(result.data);
      }
    } catch {
      setMessage("Não conseguimos conectar agora. Tente novamente em instantes.");
    } finally {
      setBusy(false);
    }
  }
  async function sendCode(reset: boolean) {
    if (busy || !email) {
      setMessage("Preencha seu e-mail primeiro.");
      return;
    }
    setBusy(true);
    try {
      const result = reset
        ? await authClient.emailOtp.requestPasswordReset({ email })
        : await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
      if (result.error) {
        setMessage(
          result.error.status === 429
            ? "Muitas tentativas. Aguarde antes de pedir outro código."
            : "Não foi possível enviar o código. Aguarde e tente novamente.",
        );
        return;
      }
      setMode(reset ? "reset" : "verify");
      setMessage(
        "Se este e-mail estiver cadastrado, você receberá um código. Confira também a caixa de spam.",
      );
    } catch {
      setMessage("Não conseguimos conectar agora. Tente novamente em instantes.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sheet auth-sheet">
      <p className="eyebrow">Minha conta</p>
      <h1>{headings[mode]}</h1>
      <p>Gerencie seus dados, sua família e o Compasso em um só lugar.</p>
      <form onSubmit={submit} className="form-stack">
        {mode === "signup" && (
          <label>
            Seu nome
            <input
              disabled={!ready || busy}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
              maxLength={80}
            />
          </label>
        )}
        {!secondFactor && (
          <label>
            E-mail
            <input
              disabled={!ready || busy}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
        )}
        {(mode === "verify" || mode === "reset" || secondFactor) && (
          <label>
            {mode === "totp"
              ? "Código do autenticador"
              : mode === "recovery"
                ? "Código de recuperação"
                : "Código recebido"}
            <input
              disabled={!ready || busy}
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              inputMode={mode === "recovery" ? "text" : "numeric"}
              autoComplete="one-time-code"
              pattern={mode === "recovery" ? undefined : "[0-9]{6}"}
              maxLength={mode === "recovery" ? 40 : 6}
              required
            />
          </label>
        )}
        {mode !== "verify" && !secondFactor && (
          <label>
            {mode === "reset" ? "Nova senha" : "Senha"}
            <input
              disabled={!ready || busy}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
        )}
        <p role="status" className="form-message">
          {message}
        </p>
        <button type="submit" disabled={!ready || busy}>
          {busy
            ? "Aguarde…"
            : mode === "signup"
              ? "Criar conta"
              : mode === "verify"
                ? "Confirmar e-mail"
                : mode === "reset"
                  ? "Salvar nova senha"
                  : secondFactor
                    ? "Confirmar entrada"
                    : "Entrar"}
        </button>
      </form>
      <div className="auth-options">
        <button
          type="button"
          className="text-button"
          disabled={!ready || busy}
          onClick={() => {
            setMode(
              secondFactor
                ? mode === "totp"
                  ? "recovery"
                  : "totp"
                : mode === "login"
                  ? "signup"
                  : "login",
            );
            setOtp("");
            setMessage("");
          }}
        >
          {mode === "totp"
            ? "Usar código de recuperação"
            : mode === "recovery"
              ? "Usar aplicativo autenticador"
              : mode === "login"
                ? "Ainda não tenho uma conta"
                : "Já tenho uma conta"}
        </button>
        {mode === "login" && (
          <button
            type="button"
            className="text-button"
            disabled={!ready || busy}
            onClick={() => sendCode(true)}
          >
            Esqueci minha senha
          </button>
        )}
        {mode === "verify" && (
          <button
            type="button"
            className="text-button"
            disabled={!ready || busy}
            onClick={() => sendCode(false)}
          >
            Enviar outro código
          </button>
        )}
      </div>
    </section>
  );
}
