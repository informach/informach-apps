"use client";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { encode } from "uqr";
import { Button, CodeInput, Field, FormMessage, TextInput } from "@/components/form";
import { authClient } from "@/lib/auth-client";

type Message = { tone: "ok" | "bad" | "info"; text: string } | null;

/** QR desenhado como SVG do próprio React, sem HTML injetado. */
function QrCode({ value }: { value: string }) {
  const { data, size } = useMemo(() => encode(value, { border: 2, ecc: "M" }), [value]);
  const cells: string[] = [];
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) cells.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return (
    <svg
      role="img"
      aria-label="Código QR para o aplicativo autenticador"
      viewBox={`0 0 ${size} ${size}`}
      className="size-56 rounded-xl border border-line-warm bg-white"
      shapeRendering="crispEdges"
    >
      <path d={cells.join("")} fill="#173247" />
    </svg>
  );
}

function secretOf(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

export function TwoFactorSetup({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ uri: string; backupCodes: string[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch {
      setMessage({
        tone: "bad",
        text: "Não foi possível conectar. Confira a internet e tente de novo.",
      });
    } finally {
      setBusy(false);
    }
  }

  function onPassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await authClient.twoFactor.enable({ password });
      if (result.error || !result.data) {
        setMessage({ tone: "bad", text: "Senha não confere." });
        return;
      }
      if (result.data.method !== "totp") {
        setMessage({ tone: "bad", text: "O autenticador não pôde ser preparado. Tente de novo." });
        return;
      }
      setPassword("");
      setSetup({ uri: result.data.totpURI, backupCodes: result.data.backupCodes });
    });
  }

  function onVerify(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") });
      if (result.error) {
        setMessage({
          tone: "bad",
          text: "Código não confere. Use o número que está no aplicativo agora.",
        });
        return;
      }
      router.replace("/");
      router.refresh();
    });
  }

  if (!setup) {
    return (
      <form onSubmit={onPassword} className="grid w-full max-w-[460px] gap-4">
        <h2 className="m-0 text-2xl font-extrabold">1. Confirme a senha</h2>
        <p className="m-0 text-ink-soft">
          Vamos gerar a chave do autenticador para <strong>{email}</strong>. Tenha à mão um
          aplicativo como Google Authenticator, Microsoft Authenticator ou 1Password.
        </p>
        {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
        <Field label="Senha" htmlFor="duas-etapas-senha">
          <TextInput
            id="duas-etapas-senha"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Gerando..." : "Gerar chave"}
        </Button>
      </form>
    );
  }

  const secret = secretOf(setup.uri);

  return (
    <div className="grid w-full max-w-[640px] gap-8">
      <section aria-labelledby="passo-qr" className="grid gap-4">
        <h2 id="passo-qr" className="m-0 text-2xl font-extrabold">
          2. Leia o código no aplicativo
        </h2>
        <div className="flex flex-wrap items-start gap-6">
          <QrCode value={setup.uri} />
          <div className="grid min-w-0 flex-1 gap-2 text-ink-soft">
            <p className="m-0">Não dá para ler? Digite esta chave no aplicativo:</p>
            <code className="tabular rounded-lg bg-sand px-3 py-2 font-mono text-sm break-all text-ink">
              {secret}
            </code>
            <p className="m-0 text-sm">O nome que aparece no aplicativo é Bastidores Informach.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="passo-recuperacao" className="grid gap-3">
        <h2 id="passo-recuperacao" className="m-0 text-2xl font-extrabold">
          3. Guarde os códigos de recuperação
        </h2>
        <p className="m-0 text-ink-soft">
          Se perder o celular, cada código abaixo entra uma vez no lugar do aplicativo. Guarde num
          gerenciador de senhas. Eles não aparecem de novo.
        </p>
        <ul className="tabular m-0 grid list-none grid-cols-2 gap-2 rounded-xl border border-line-warm bg-surface p-4 font-mono text-[15px] sm:grid-cols-3">
          {setup.backupCodes.map((backup) => (
            <li key={backup}>{backup}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(setup.backupCodes.join("\n"))
                .then(() => setMessage({ tone: "ok", text: "Códigos copiados." }))
                .catch(() =>
                  setMessage({
                    tone: "info",
                    text: "Não deu para copiar. Anote os códigos à mão.",
                  }),
                );
            }}
          >
            Copiar códigos
          </Button>
          <label className="flex min-h-12 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
              className="size-5"
            />
            Guardei os códigos
          </label>
        </div>
      </section>

      <form onSubmit={onVerify} aria-labelledby="passo-codigo" className="grid max-w-[420px] gap-4">
        <h2 id="passo-codigo" className="m-0 text-2xl font-extrabold">
          4. Digite o código do aplicativo
        </h2>
        {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
        <Field label="Código de 6 números" htmlFor="duas-etapas-codigo">
          <CodeInput
            id="duas-etapas-codigo"
            required
            maxLength={7}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="action" disabled={busy || !saved}>
          {busy ? "Conferindo..." : "Ativar e entrar"}
        </Button>
        {!saved ? (
          <p className="m-0 text-[13px] text-ink-muted">
            Marque que guardou os códigos para continuar.
          </p>
        ) : null}
      </form>
    </div>
  );
}
