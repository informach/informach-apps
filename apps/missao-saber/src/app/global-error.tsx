"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="pt-BR">
      <body>
        <main>
          <h1>Não foi possível abrir o Missão Saber.</h1>
          <p>Tente carregar novamente em alguns instantes.</p>
          <button type="button" onClick={reset}>
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
