"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({
  reset,
  error,
}: {
  reset: () => void;
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="profiles" id="conteudo">
      <h1>Não conseguimos abrir esta tela.</h1>
      <p className="muted lead">
        Os treinos já salvos continuam guardados. Tente carregar de novo.
      </p>
      <div className="row">
        <button type="button" className="btn primary big" onClick={reset}>
          Tentar de novo
        </button>
        <a href="/perfis" className="btn ghost">
          Voltar ao início
        </a>
      </div>
    </main>
  );
}
