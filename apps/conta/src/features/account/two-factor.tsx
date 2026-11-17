"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { encode } from "uqr";
import { authClient } from "@/lib/auth-client";

function AuthenticatorQr({ uri }: { uri: string }) {
  const path = useMemo(() => {
    const { data, size } = encode(uri, { border: 4, ecc: "M" });
    const cells: string[] = [];
    data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) cells.push(`M${x} ${y}h1v1h-1z`);
      });
    });
    return { size, cells: cells.join("") };
  }, [uri]);
  return (
    <svg
      role="img"
      aria-label="Código QR para o aplicativo autenticador"
      className="authenticator-qr"
      viewBox={`0 0 ${path.size} ${path.size}`}
      shapeRendering="crispEdges"
    >
      <path d={path.cells} fill="currentColor" />
    </svg>
  );
}

type Setup = { uri: string | null; codes: string[] };

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function manage(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const input = new FormData(form);
    const password = String(input.get("password") ?? "");
    const action = String(input.get("action") ?? "enable");
    setPending(true);
    setMessage("");
    try {
      if (action === "disable") {
        const result = await authClient.twoFactor.disable({ password });
        if (result.error) {
          setMessage(
            "Não foi possível desativar. Confira a senha; se sua entrada é antiga, saia e entre novamente.",
          );
          return;
        }
        setSetup(null);
        setMessage("Autenticador desativado nesta conta.");
      } else if (action === "regenerate") {
        const result = await authClient.twoFactor.generateBackupCodes({ password });
        if (result.error || !result.data) {
          setMessage("Não conseguimos gerar os códigos. Confira a senha e tente de novo.");
          return;
        }
        setSetup({ uri: null, codes: result.data.backupCodes });
        setMessage("Os códigos anteriores foram invalidados. Guarde os novos em um lugar seguro.");
      } else {
        const result = await authClient.twoFactor.enable({ password });
        if (result.error || result.data?.method !== "totp") {
          setMessage("Não conseguimos preparar o autenticador. Confira a senha e tente de novo.");
          return;
        }
        setSetup({ uri: result.data.totpURI, codes: result.data.backupCodes });
      }
      form.reset();
      router.refresh();
    } catch {
      setMessage("Não conseguimos conectar agora. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function confirm(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") ?? "");
    setPending(true);
    setMessage("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
      if (result.error) {
        setMessage("O código não conferiu. Use os números atuais do aplicativo autenticador.");
        return;
      }
      setSetup(null);
      form.reset();
      setMessage("Autenticador ativado. As outras sessões vinculadas à conta foram encerradas.");
      router.refresh();
    } catch {
      setMessage("Não conseguimos conectar agora. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="sheet two-factor-settings">
      <h3>Autenticação em duas etapas</h3>
      <p>
        {enabled
          ? "Ativada. Sua entrada também pede um código do autenticador."
          : "Proteja sua conta com um código do aplicativo autenticador, além da senha."}
      </p>
      {setup ? (
        <div className="form-stack">
          {setup.uri && (
            <>
              <p>
                Leia este QR no aplicativo autenticador. A chave fica somente nesta tela e no seu
                autenticador.
              </p>
              <AuthenticatorQr uri={setup.uri} />
              <label>
                Chave para configuração manual
                <input
                  readOnly
                  value={new URL(setup.uri).searchParams.get("secret") ?? ""}
                  autoComplete="off"
                  onFocus={(event) => event.target.select()}
                />
              </label>
            </>
          )}
          <p>
            Guarde seus códigos de recuperação fora deste aparelho. Cada código permite uma única
            entrada se você perder o autenticador.
          </p>
          <ul className="recovery-codes" aria-label="Códigos de recuperação">
            {setup.codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          {setup.uri ? (
            <form onSubmit={confirm} className="form-stack">
              <label>
                Código do autenticador
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </label>
              <label className="check-label">
                <input type="checkbox" required />
                Guardei os códigos de recuperação em um lugar seguro.
              </label>
              <button type="submit" disabled={pending}>
                {pending ? "Confirmando…" : "Ativar autenticador"}
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setSetup(null)}>
              Guardei os novos códigos
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={manage} className="form-stack">
          {enabled && (
            <label>
              O que deseja fazer?
              <select name="action" defaultValue="regenerate">
                <option value="regenerate">Gerar novos códigos de recuperação</option>
                <option value="disable">Desativar autenticador</option>
              </select>
            </label>
          )}
          <label>
            Confirme sua senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </label>
          {enabled && (
            <label className="check-label">
              <input type="checkbox" required />
              Confirmo esta alteração na proteção da minha conta.
            </label>
          )}
          <button type="submit" disabled={pending}>
            {pending ? "Aguarde…" : enabled ? "Confirmar alteração" : "Configurar autenticador"}
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </article>
  );
}
