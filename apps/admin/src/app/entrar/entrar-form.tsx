"use client";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, CodeInput, Field, FormMessage, TextInput } from "@/components/form";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";

type Step = "senha" | "codigo" | "recuperacao" | "nova-senha-email" | "nova-senha-codigo";
type Message = { tone: "ok" | "bad" | "info"; text: string } | null;

const CONNECTION = "Não foi possível conectar. Confira a internet e tente de novo.";

function Steps({ current }: { current: 1 | 2 }) {
  const item = (n: 1 | 2, label: string) => (
    <li
      aria-current={current === n ? "step" : undefined}
      className={`rounded-full px-3 py-1.5 ${current === n ? "bg-night text-white" : "bg-sand-strong text-ink-soft"}`}
    >
      {n} · {label}
    </li>
  );
  return (
    <ol aria-label="Etapas" className="m-0 flex list-none gap-2 p-0 text-[13px] font-bold">
      {item(1, "Senha")}
      {item(2, "Código")}
    </ol>
  );
}

export function EntrarForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("senha");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  function go(nextStep: Step, nextMessage: Message = null) {
    setStep(nextStep);
    setCode("");
    setMessage(nextMessage);
  }

  function finish() {
    // O servidor já filtrou `next`; a mesma regra de novo antes de navegar.
    router.replace(safeNext(next) as Route);
    router.refresh();
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch {
      setMessage({ tone: "bad", text: CONNECTION });
    } finally {
      setBusy(false);
    }
  }

  function onPassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setMessage({
          tone: "bad",
          text:
            result.error.status === 429
              ? "Muitas tentativas seguidas. Espere um minuto e tente de novo."
              : "E-mail ou senha não conferem.",
        });
        return;
      }
      setPassword("");
      if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        go("codigo");
        return;
      }
      // Sem duas etapas ainda: o servidor leva para a configuração ou para a recusa.
      finish();
    });
  }

  function onCode(event: FormEvent) {
    event.preventDefault();
    const clean = code.replace(/\s+/g, "");
    void run(async () => {
      const result =
        step === "recuperacao"
          ? await authClient.twoFactor.verifyBackupCode({ code: clean })
          : await authClient.twoFactor.verifyTotp({ code: clean });
      if (result.error) {
        setMessage({
          tone: "bad",
          text:
            step === "recuperacao"
              ? "Esse código de recuperação não confere ou já foi usado."
              : "Código não confere. Use o número que está no aplicativo agora.",
        });
        return;
      }
      finish();
    });
  }

  function onRequestReset(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await authClient.emailOtp.requestPasswordReset({ email: email.trim() });
      if (result.error) {
        setMessage({
          tone: "bad",
          text:
            result.error.status === 429
              ? "Muitos pedidos de código. Espere um pouco e tente de novo."
              : "Não deu para pedir o código agora. Tente de novo.",
        });
        return;
      }
      go("nova-senha-codigo", {
        tone: "info",
        text: "Se este e-mail for de alguém da equipe, o código chega em instantes. Ele vale por 10 minutos.",
      });
    });
  }

  function onReset(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await authClient.emailOtp.resetPassword({
        email: email.trim(),
        otp: code.replace(/\s+/g, ""),
        password,
      });
      if (result.error) {
        setMessage({
          tone: "bad",
          text: "Código vencido ou senha curta demais. Confira e tente de novo.",
        });
        return;
      }
      setPassword("");
      go("senha", { tone: "ok", text: "Senha salva. Agora entre com ela." });
    });
  }

  const onCodeStep = step === "codigo" || step === "recuperacao";

  return (
    <div className="grid w-full max-w-[420px] gap-5">
      {step === "senha" || onCodeStep ? <Steps current={onCodeStep ? 2 : 1} /> : null}

      {step === "senha" ? (
        <form onSubmit={onPassword} className="grid gap-4">
          <h2
            id="entrar"
            className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.02em]"
          >
            Entrar no Bastidores
          </h2>
          {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
          <Field label="E-mail" htmlFor="entrar-email">
            <TextInput
              id="entrar-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Senha" htmlFor="entrar-senha">
            <TextInput
              id="entrar-senha"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Conferindo..." : "Continuar"}
          </Button>
          <Button
            variant="quiet"
            className="justify-self-start px-0"
            onClick={() => go("nova-senha-email")}
          >
            Criar ou trocar a senha
          </Button>
        </form>
      ) : null}

      {onCodeStep ? (
        <form onSubmit={onCode} className="grid gap-4">
          <h2
            id="entrar"
            className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.02em]"
          >
            {step === "recuperacao"
              ? "Use um código de recuperação"
              : "Digite o código do autenticador"}
          </h2>
          <p className="m-0 text-ink-soft">
            {step === "recuperacao"
              ? "É um dos códigos que você guardou ao ativar as duas etapas. Cada um vale uma vez."
              : `São 6 números e mudam a cada 30 segundos, no aplicativo que você configurou para ${email.trim()}.`}
          </p>
          {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
          {step === "recuperacao" ? (
            <Field label="Código de recuperação" htmlFor="entrar-recuperacao">
              <TextInput
                id="entrar-recuperacao"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="font-mono text-lg tracking-widest"
              />
            </Field>
          ) : (
            <Field label="Código de 6 números" htmlFor="entrar-codigo">
              <CodeInput
                id="entrar-codigo"
                required
                maxLength={7}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
          )}
          <Button type="submit" variant="action" disabled={busy}>
            {busy ? "Conferindo..." : "Entrar"}
          </Button>
          <div className="flex flex-wrap gap-x-5">
            <Button variant="quiet" className="px-0" onClick={() => go("senha")}>
              Voltar e trocar de conta
            </Button>
            <Button
              variant="quiet"
              className="px-0"
              onClick={() => go(step === "recuperacao" ? "codigo" : "recuperacao")}
            >
              {step === "recuperacao" ? "Usar o aplicativo" : "Perdi o celular"}
            </Button>
          </div>
        </form>
      ) : null}

      {step === "nova-senha-email" ? (
        <form onSubmit={onRequestReset} className="grid gap-4">
          <h2
            id="entrar"
            className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.02em]"
          >
            Criar ou trocar a senha
          </h2>
          <p className="m-0 text-ink-soft">
            A conta é a mesma dos produtos Informach. Se você sempre entrou por código no e-mail,
            crie aqui uma senha para o Bastidores.
          </p>
          {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
          <Field label="E-mail" htmlFor="senha-email">
            <TextInput
              id="senha-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Enviando..." : "Receber código por e-mail"}
          </Button>
          <Button variant="quiet" className="justify-self-start px-0" onClick={() => go("senha")}>
            Voltar
          </Button>
        </form>
      ) : null}

      {step === "nova-senha-codigo" ? (
        <form onSubmit={onReset} className="grid gap-4">
          <h2
            id="entrar"
            className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.02em]"
          >
            Nova senha
          </h2>
          {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
          <Field label="Código do e-mail" htmlFor="senha-codigo">
            <CodeInput
              id="senha-codigo"
              required
              maxLength={7}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field
            label="Nova senha"
            htmlFor="senha-nova"
            hint="Pelo menos 8 caracteres. Use uma senha só sua, que não está em outro lugar."
          >
            <TextInput
              id="senha-nova"
              aria-describedby="senha-nova-dica"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando..." : "Salvar senha"}
          </Button>
          <Button variant="quiet" className="justify-self-start px-0" onClick={() => go("senha")}>
            Voltar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
