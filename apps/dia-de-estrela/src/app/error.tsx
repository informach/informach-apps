"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Lumi } from "@/components/desenhos";

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
      <Lumi tamanho={110} humor="calma" />
      <h1 className="font-display text-4xl font-extrabold">Não conseguimos abrir esta tela.</h1>
      <p className="max-w-md text-lg font-semibold text-tinta-suave">
        As estrelas e as rotinas continuam guardadas. Tente carregar de novo.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className="b3 b3-ceu" onClick={reset}>
          Tentar de novo
        </button>
        <a href="/" className="b3 b3-claro">
          Voltar ao início
        </a>
      </div>
    </main>
  );
}
