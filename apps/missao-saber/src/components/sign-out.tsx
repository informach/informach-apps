"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  clearLocalLearningDrafts,
  endPendingLabSession,
  flushPendingLabs,
} from "@/features/labs/runtime/pending-work";
import { forgetProfileAction } from "@/features/learning/actions";
import { authClient } from "@/lib/auth-client";

const sessionEndKey = "missao-session-ended";

function closeLocalSession() {
  endPendingLabSession();
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try {
      clearLocalLearningDrafts(window[kind]);
    } catch {
      // A storage failure must not prevent clearing the other store or leaving the session.
    }
  }
  // A new document clears private router state and in-flight renders from the old session.
  window.location.replace("/");
}

export function SignOut() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [allowDiscard, setAllowDiscard] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      closeLocalSession();
    };
    const changed = (event: StorageEvent) => {
      if (event.key === sessionEndKey && event.newValue !== event.oldValue) close();
    };
    window.addEventListener("storage", changed);
    try {
      channel.current = new BroadcastChannel(sessionEndKey);
      channel.current.onmessage = close;
    } catch {
      // The storage event remains available when BroadcastChannel is unavailable.
    }
    return () => {
      window.removeEventListener("storage", changed);
      channel.current?.close();
      channel.current = null;
    };
  }, []);
  async function leave(discard: boolean) {
    setError("");
    try {
      if (!discard && !(await flushPendingLabs())) {
        setAllowDiscard(true);
        setError(
          "Sua investigação ainda não foi salva. Resolva o aviso no laboratório ou saia apagando os rascunhos deste aparelho.",
        );
        return;
      }
      await forgetProfileAction();
      const result = await authClient.signOut();
      if (result.error) {
        setError("Não foi possível sair. Tente novamente.");
        return;
      }
      try {
        channel.current?.postMessage("signed-out");
      } catch {
        // The storage event remains an independent notification path.
      }
      try {
        localStorage.setItem(sessionEndKey, crypto.randomUUID());
      } catch {
        // BroadcastChannel still notifies other tabs when local storage is unavailable.
      }
      closeLocalSession();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="rounded-md font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta"
        onClick={() => start(() => leave(false))}
      >
        {pending ? "Saindo…" : "Sair da conta"}
      </button>
      {allowDiscard && (
        <button
          type="button"
          disabled={pending}
          className="rounded-md font-semibold text-coral-solido underline"
          onClick={() => start(() => leave(true))}
        >
          Sair e apagar rascunhos deste aparelho
        </button>
      )}
      {error && (
        <span role="alert" className="font-semibold text-coral-solido">
          {error}
        </span>
      )}
    </span>
  );
}
