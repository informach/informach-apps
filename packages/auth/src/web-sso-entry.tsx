"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createWebSsoAuthClient } from "./web-sso-client";
import { type WebSsoConfig, webAppDestination, webSsoClient } from "./web-sso-contract";

type Completion = (
  destination: string,
) => Promise<{ ok: true; data: { destination: string } } | { ok: false; error: string }>;
/** Credentials, verification and recovery stay in the central. Apps only initiate their registered OIDC flow. */
export function WebSsoEntry({
  app,
  environment,
  next,
  buttonClassName,
  reauthenticate = false,
  complete,
}: {
  app: string;
  environment: WebSsoConfig["environment"];
  next: string;
  buttonClassName?: string;
  reauthenticate?: boolean;
  complete?: Completion;
}) {
  const client = useMemo(() => webSsoClient(app, environment), [app, environment]);
  const auth = useMemo(() => createWebSsoAuthClient(app, environment), [app, environment]);
  const destination = webAppDestination(next, "/");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const storageKey = `compasso:entry:${app}`;
  const finish = useCallback(async () => {
    if (!complete) return;
    try {
      const url = new URL(window.location.href);
      const receipt = url.searchParams.get("entrada");
      if (!receipt || receipt !== sessionStorage.getItem(storageKey)) return;
      setBusy(true);
      const result = await complete(destination);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      sessionStorage.removeItem(storageKey);
      window.location.replace(webAppDestination(result.data.destination, "/"));
    } catch {
      setMessage("Não foi possível concluir a entrada neste aparelho. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }, [complete, destination, storageKey]);
  useEffect(() => {
    setReady(true);
    void finish();
  }, [finish]);
  async function signIn(forceLogin: boolean) {
    setBusy(true);
    setMessage("");
    try {
      let callbackPath = destination;
      if (complete) {
        const receipt = crypto.randomUUID();
        sessionStorage.setItem(storageKey, receipt);
        callbackPath = `${window.location.pathname}?${new URLSearchParams({ next: destination, entrada: receipt })}`;
      }
      const result = await auth.signIn.social({
        provider: client.providerId,
        callbackURL: `${client.origin}${callbackPath}`,
        ...(forceLogin ? { additionalParams: { prompt: "login" } } : {}),
      });
      if (result.error)
        setMessage(
          result.error.status === 429
            ? "Aguarde um pouco antes de tentar novamente."
            : "Não conseguimos abrir sua conta agora. Tente novamente.",
        );
    } catch {
      setMessage("Não conseguimos abrir sua conta agora. Confira a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack" style={{ display: "grid", gap: "1rem" }}>
      <p>
        Use sua conta compartilhada. Login, senha e confirmação de e-mail ficam na central da conta.
      </p>
      <button
        type="button"
        className={buttonClassName}
        disabled={!ready || busy}
        onClick={() => void signIn(reauthenticate)}
      >
        {busy
          ? "Continuando…"
          : reauthenticate
            ? "Confirmar minha identidade"
            : "Continuar com minha conta"}
      </button>
      {!reauthenticate && (
        <button
          type="button"
          className={buttonClassName}
          disabled={!ready || busy}
          onClick={() => void signIn(true)}
        >
          Entrar novamente com senha
        </button>
      )}
      <p>Você também pode criar sua conta ou recuperar a senha na próxima tela.</p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
