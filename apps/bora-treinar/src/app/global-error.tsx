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
      {/* Sem o CSS do app: este erro acontece antes do layout raiz, então o
          estilo é inline, só o suficiente para ler e tentar de novo. */}
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0b0d10",
          color: "#f4f6f8",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", lineHeight: 1.25, margin: "0 0 12px" }}>
            Não foi possível abrir o Bora Treinar.
          </h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.5 }}>
            Os treinos já salvos continuam guardados. Tente carregar novamente em alguns instantes.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              font: "inherit",
              fontWeight: 600,
              padding: "12px 20px",
              borderRadius: "12px",
              border: "0",
              background: "#c8ff2e",
              color: "#0b0d10",
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
