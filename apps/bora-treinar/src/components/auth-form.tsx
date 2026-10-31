"use client";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";

export type Mode = "login" | "signup" | "verify" | "otp" | "reset" | "reset-confirm";

/** O limite de tentativas responde 429; sem esta leitura ele pareceria senha errada. */
function limite(error: { status?: number } | null | undefined) {
  return error?.status === 429
    ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."
    : null;
}

export function AuthForm({
  initialMode = "login",
  initialMessage = "",
  next = "/perfis",
}: {
  initialMode?: Mode;
  initialMessage?: string;
  next?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [pending, start] = useTransition();
  const navigate = () => window.location.assign(next);

  const submit = () =>
    start(async () => {
      setMessage("");
      try {
        if (mode === "signup") {
          if (!consent) return setMessage("Confirme que você é maior de idade para criar a conta.");
          const r = await authClient.signUp.email({ email, password, name });
          if (r.error)
            return setMessage(
              limite(r.error) ??
                "Não foi possível criar a conta. Se já tem uma conta Informach, use Entrar ou recupere a senha.",
            );
          setMode("verify");
          setMessage("Confira seu e-mail e digite o código de seis dígitos.");
        } else if (mode === "login") {
          const r = await authClient.signIn.email({ email, password });
          if (r.error)
            return setMessage(
              limite(r.error) ??
                "Confira seus dados. Se o e-mail ainda não foi confirmado, use Confirmar e-mail.",
            );
          navigate();
        } else if (mode === "verify") {
          const r = await authClient.emailOtp.verifyEmail({ email, otp });
          if (r.error)
            return setMessage(limite(r.error) ?? "Código inválido ou expirado. Peça outro código.");
          if (password && !(await authClient.signIn.email({ email, password })).error)
            return navigate();
          setMode("login");
          setMessage("E-mail confirmado. Entre para continuar.");
        } else if (mode === "otp") {
          const r = await authClient.signIn.emailOtp({ email, otp });
          if (r.error)
            return setMessage(limite(r.error) ?? "Código inválido ou expirado. Peça outro código.");
          navigate();
        } else if (mode === "reset") {
          const r = await authClient.emailOtp.requestPasswordReset({ email });
          if (r.error)
            return setMessage(limite(r.error) ?? "Não foi possível pedir o código agora.");
          setMode("reset-confirm");
          setMessage("Se houver uma conta com esse e-mail, você vai receber um código.");
        } else {
          const r = await authClient.emailOtp.resetPassword({ email, otp, password });
          if (r.error)
            return setMessage(
              limite(r.error) ?? "Não foi possível redefinir. Confira o código e a nova senha.",
            );
          setMode("login");
          setPassword("");
          setMessage("Senha atualizada. Entre com a nova senha.");
        }
      } catch {
        setMessage("Não foi possível conectar. Tente de novo em instantes.");
      }
    });

  const pedirCodigo = (type: "sign-in" | "email-verification") =>
    start(async () => {
      try {
        const r = await authClient.emailOtp.sendVerificationOtp({ email, type });
        if (r.error) return setMessage(limite(r.error) ?? "Não foi possível pedir o código agora.");
        setMode(type === "sign-in" ? "otp" : "verify");
        setMessage(
          type === "sign-in"
            ? "Se você já tem uma conta, confira seu e-mail."
            : "Se o e-mail precisar de confirmação, um novo código foi enviado.",
        );
      } catch {
        setMessage("Não foi possível enviar. Tente de novo.");
      }
    });

  return (
    <div className="auth">
      <div className="tabs auth-tabs">
        {(["login", "signup"] as const).map((alvo) => (
          <button
            key={alvo}
            type="button"
            className="tab"
            aria-current={mode === alvo ? "page" : undefined}
            onClick={() => {
              setMode(alvo);
              setMessage("");
            }}
          >
            {alvo === "login" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>
      <form
        className="form-grid single"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mode === "signup" && (
          <label>
            <span className="muted">Seu nome</span>
            <input
              className="field"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={80}
              required
            />
          </label>
        )}
        <label>
          <span className="muted">E-mail</span>
          <input
            className="field"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
            data-autofocus
          />
        </label>
        {["login", "signup", "reset-confirm"].includes(mode) && (
          <label>
            <span className="muted">{mode === "reset-confirm" ? "Nova senha" : "Senha"}</span>
            <input
              className="field"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "login" ? 1 : 12}
              maxLength={128}
              required
            />
          </label>
        )}
        {["verify", "otp", "reset-confirm"].includes(mode) && (
          <label>
            <span className="muted">Código de seis dígitos</span>
            <input
              className="field otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required
            />
          </label>
        )}
        {mode === "signup" && (
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Sou maior de 18 anos e responsável pelos perfis que vou criar. Li os{" "}
              <a href="/termos">termos</a> e a <a href="/privacidade">política de privacidade</a>.
            </span>
          </label>
        )}
        <button type="submit" className="btn primary big" disabled={pending}>
          {pending
            ? "Aguarde…"
            : mode === "signup"
              ? "Criar conta"
              : mode === "reset"
                ? "Enviar código"
                : mode === "reset-confirm"
                  ? "Definir nova senha"
                  : mode === "verify"
                    ? "Confirmar e-mail"
                    : "Entrar no Bora Treinar"}
        </button>
        <p role="status" className="form-message">
          {message}
        </p>
      </form>
      <div className="auth-links">
        <button
          type="button"
          className="link"
          disabled={pending || !email.includes("@")}
          onClick={() => pedirCodigo("sign-in")}
        >
          Entrar com código por e-mail
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode("reset");
            setPassword("");
            setMessage("");
          }}
        >
          Esqueci minha senha
        </button>
        <button
          type="button"
          className="link"
          disabled={pending || !email.includes("@")}
          onClick={() => pedirCodigo("email-verification")}
        >
          Confirmar e-mail / reenviar código
        </button>
      </div>
    </div>
  );
}
