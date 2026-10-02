"use client";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { cn } from "@informach/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { BotaoChapa } from "./ui/botao-chapa";

export type Mode = "login" | "signup" | "verify" | "otp" | "reset" | "reset-confirm";

const campo = "mt-1.5 h-12 rounded-controle border-2 border-sombra bg-creme";
const opcao =
  "rounded-md text-left text-sm font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta disabled:opacity-60";

/** O limite de tentativas responde 429; sem esta leitura ele pareceria senha errada. */
function limite(error: { status?: number } | null | undefined) {
  return error?.status === 429
    ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."
    : null;
}

export function AuthForm({
  initialMode = "login",
  initialMessage = "",
}: {
  initialMode?: Mode;
  initialMessage?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [pending, start] = useTransition();
  const router = useRouter();
  function navigate() {
    router.push("/familia");
    router.refresh();
  }
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-controle border-2 border-sombra bg-papel p-1.5">
        {(["login", "signup"] as const).map((alvo) => (
          <button
            key={alvo}
            type="button"
            aria-pressed={mode === alvo}
            onClick={() => {
              setMode(alvo);
              setMessage("");
            }}
            className={cn(
              "min-h-11 rounded-[0.7rem] font-display font-semibold transition-colors",
              mode === alvo
                ? "bg-verde-solido text-sobre-verde"
                : "text-tinta-suave hover:text-tinta",
            )}
          >
            {alvo === "login" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            setMessage("");
            try {
              if (mode === "signup") {
                if (!consent) {
                  setMessage("Confirme que você é o responsável para criar a conta.");
                  return;
                }
                const result = await authClient.signUp.email({ email, password, name });
                if (result.error) {
                  setMessage(
                    limite(result.error) ??
                      "Não foi possível criar a conta. Se já tem uma conta Informach, use Entrar ou recupere sua senha.",
                  );
                  return;
                }
                setMode("verify");
                setMessage("Confira seu e-mail e digite o código de seis dígitos.");
              } else if (mode === "login") {
                const result = await authClient.signIn.email({ email, password });
                if (result.error) {
                  setMessage(
                    limite(result.error) ??
                      "Confira seus dados. Se o e-mail ainda não foi confirmado, use Confirmar e-mail.",
                  );
                  return;
                }
                navigate();
              } else if (mode === "verify") {
                const result = await authClient.emailOtp.verifyEmail({ email, otp });
                if (result.error) {
                  setMessage(
                    limite(result.error) ?? "Código inválido ou expirado. Solicite outro código.",
                  );
                  return;
                }
                if (password) {
                  const signed = await authClient.signIn.email({ email, password });
                  if (signed.error) {
                    setMode("login");
                    setMessage("E-mail confirmado. Entre para continuar.");
                    return;
                  }
                  navigate();
                } else {
                  setMode("login");
                  setMessage("E-mail confirmado. Entre para continuar.");
                }
              } else if (mode === "otp") {
                const result = await authClient.signIn.emailOtp({ email, otp });
                if (result.error) {
                  setMessage(
                    limite(result.error) ?? "Código inválido ou expirado. Solicite outro código.",
                  );
                  return;
                }
                navigate();
              } else if (mode === "reset") {
                const result = await authClient.emailOtp.requestPasswordReset({ email });
                if (result.error) {
                  setMessage(
                    limite(result.error) ??
                      "Não foi possível solicitar o código agora. Tente novamente.",
                  );
                  return;
                }
                setMode("reset-confirm");
                setMessage(
                  "Se houver uma conta com esse e-mail, você receberá um código para redefinir a senha.",
                );
              } else {
                const result = await authClient.emailOtp.resetPassword({ email, otp, password });
                if (result.error) {
                  setMessage(
                    limite(result.error) ??
                      "Não foi possível redefinir. Confira o código e a nova senha.",
                  );
                  return;
                }
                setMode("login");
                setPassword("");
                setMessage("Senha atualizada. Entre com sua nova senha.");
              }
            } catch {
              setMessage("Não foi possível conectar. Tente novamente em instantes.");
            }
          });
        }}
      >
        {mode === "signup" && (
          <div className="mb-4">
            <Label htmlFor="nome">Como podemos chamar o responsável?</Label>
            <Input
              id="nome"
              className={campo}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={80}
              required
            />
          </div>
        )}
        <div className="mb-4">
          <Label htmlFor="email">E-mail do responsável</Label>
          <Input
            id="email"
            className={campo}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
          />
        </div>
        {["login", "signup", "reset-confirm"].includes(mode) && (
          <div className="mb-4">
            <Label htmlFor="senha">{mode === "reset-confirm" ? "Nova senha" : "Senha"}</Label>
            <Input
              id="senha"
              className={campo}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "login" ? 1 : 12}
              maxLength={128}
              required
            />
          </div>
        )}
        {["verify", "otp", "reset-confirm"].includes(mode) && (
          <div className="mb-4">
            <Label htmlFor="codigo">Código de seis dígitos</Label>
            <Input
              id="codigo"
              className={cn(campo, "font-display text-lg tracking-[0.3em]")}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required
            />
          </div>
        )}
        {mode === "signup" && (
          <div className="mb-5 flex items-start gap-3">
            <input
              id="consentimento"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
              className="mt-1 size-5 shrink-0 accent-[var(--ms-verde)]"
            />
            <Label htmlFor="consentimento" className="text-sm leading-snug font-normal">
              Sou maior de 18 anos e responsável pelo estudante. Li os{" "}
              <a href="/termos" className="font-semibold underline underline-offset-4">
                termos
              </a>{" "}
              e a{" "}
              <a href="/privacidade" className="font-semibold underline underline-offset-4">
                política de privacidade
              </a>
              .
            </Label>
          </div>
        )}
        <BotaoChapa type="submit" medida="g" className="w-full" disabled={pending}>
          {pending
            ? "Aguarde…"
            : mode === "signup"
              ? "Criar conta do responsável"
              : mode === "reset"
                ? "Enviar código de recuperação"
                : mode === "reset-confirm"
                  ? "Definir nova senha"
                  : mode === "verify"
                    ? "Confirmar e-mail"
                    : "Entrar no Missão Saber"}
        </BotaoChapa>
        <p role="status" className="mt-3 min-h-6 text-sm font-semibold text-tinta">
          {message}
        </p>
      </form>

      <div className="mt-5 grid gap-2.5 border-t-2 border-sombra pt-5">
        <button
          type="button"
          className={opcao}
          disabled={pending || !email.includes("@")}
          onClick={() =>
            start(async () => {
              try {
                const result = await authClient.emailOtp.sendVerificationOtp({
                  email,
                  type: "sign-in",
                });
                if (result.error) {
                  setMessage(limite(result.error) ?? "Não foi possível solicitar o código agora.");
                  return;
                }
                setMode("otp");
                setMessage("Se você já tem uma conta, confira seu e-mail.");
              } catch {
                setMessage("Não foi possível enviar. Tente novamente.");
              }
            })
          }
        >
          Entrar com código por e-mail
        </button>
        <button
          type="button"
          className={opcao}
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
          className={opcao}
          disabled={pending || !email.includes("@")}
          onClick={() =>
            start(async () => {
              try {
                const result = await authClient.emailOtp.sendVerificationOtp({
                  email,
                  type: "email-verification",
                });
                if (result.error) {
                  setMessage(
                    limite(result.error) ??
                      "Não foi possível solicitar o código agora. Tente novamente.",
                  );
                  return;
                }
                setMode("verify");
                setMessage("Se o e-mail precisar de confirmação, um novo código será enviado.");
              } catch {
                setMessage("Não foi possível solicitar o código.");
              }
            })
          }
        >
          Confirmar e-mail / reenviar código
        </button>
      </div>
    </div>
  );
}
