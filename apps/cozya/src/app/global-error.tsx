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
        <div className="flex min-h-screen flex-col items-center justify-center gap-3">
          <h2 className="text-xl font-semibold">Erro fatal.</h2>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
