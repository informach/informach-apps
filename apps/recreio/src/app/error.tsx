"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Simbolo } from "@/components/desenhos";

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
    <main
      id="conteudo"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <Simbolo tamanho={72} />
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Não conseguimos abrir esta tela.
      </h1>
      <p className="max-w-md text-lg text-tinta-suave">
        Sua conta continua como estava. Tente carregar de novo.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className="rb rb-sol" onClick={reset}>
          Tentar de novo
        </button>
        <a href="/" className="rb rb-vazado">
          Voltar ao início
        </a>
      </div>
    </main>
  );
}
