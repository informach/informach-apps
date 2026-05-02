"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function RouteError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h2 className="text-xl font-semibold">Algo deu errado.</h2>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
      >
        Tentar novamente
      </button>
    </div>
  );
}
