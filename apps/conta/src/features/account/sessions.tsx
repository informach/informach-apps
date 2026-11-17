"use client";
import type { listWebSessions } from "@informach/auth/web-sessions";
import { APPS } from "@informach/config/apps";
import { useActionState } from "react";
import { revokeSessionAction } from "./session-actions";

export type AccountSessions = Awaited<ReturnType<typeof listWebSessions>>;
function RevokeForm({ sessionId, current }: { sessionId?: string; current?: boolean }) {
  const [state, action, pending] = useActionState(revokeSessionAction, { ok: false, message: "" });
  if (state.currentRevoked)
    return (
      <p role="status">
        Você saiu desta central e dos apps vinculados. <a href="/entrar">Entrar novamente</a>
      </p>
    );
  return (
    <form action={action} className="form-stack">
      {sessionId ? (
        <>
          <input type="hidden" name="mode" value="one" />
          <input type="hidden" name="sessionId" value={sessionId} />
        </>
      ) : (
        <label>
          Quais entradas encerrar?
          <select name="mode" defaultValue="others">
            <option value="others">Todas as outras entradas</option>
            <option value="all">Todas, incluindo esta</option>
          </select>
        </label>
      )}
      <label className="check-label">
        <input type="checkbox" name="confirmed" required />
        {current
          ? "Confirmo sair também deste navegador."
          : "Confirmo encerrar as entradas selecionadas e seus apps."}
      </label>
      <button type="submit" className="secondary" disabled={pending}>
        {pending
          ? "Encerrando…"
          : sessionId
            ? "Encerrar esta entrada"
            : "Encerrar entradas selecionadas"}
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}

export function SessionSettings({ data }: { data: AccountSessions }) {
  return (
    <article className="sheet session-settings">
      <h3>Onde sua conta está aberta</h3>
      <p>
        Cada entrada na central pode abrir os apps neste navegador. Encerrá-la também encerra os
        acessos vinculados a ela.
      </p>
      <ul className="session-list">
        {data.sessions.map((session) => (
          <li key={session.id}>
            <details>
              <summary className="session-summary">
                {session.device}
                {session.current ? " · Entrada atual" : ""}
                <small>
                  Desde{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "America/Sao_Paulo",
                  }).format(session.createdAt)}
                </small>
              </summary>
              <p>
                {session.apps.length
                  ? `Apps abertos: ${session.apps.map((slug) => Object.values(APPS).find((app) => app.slug === slug)?.name ?? "Aplicativo").join(", ")}.`
                  : "Nenhum app vinculado a esta entrada."}
              </p>
              <RevokeForm sessionId={session.id} current={session.current} />
            </details>
          </li>
        ))}
      </ul>
      {data.hasMore && (
        <p>
          Mostrando as 50 entradas mais recentes. A opção abaixo também encerra as que não aparecem
          nesta lista.
        </p>
      )}
      <RevokeForm />
    </article>
  );
}
