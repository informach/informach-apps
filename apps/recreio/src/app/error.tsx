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
  const versaoAnterior = error.name === "UnrecognizedActionError";
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
        {versaoAnterior ? "Atualizamos o Recreio." : "Não conseguimos abrir esta tela."}
      </h1>
      <p className="max-w-md text-lg text-tinta-suave">
        {versaoAnterior
          ? "Carregue a versão atual para continuar."
          : "Carregue a página e confira o resultado antes de tentar novamente."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          className="rb rb-sol"
          onClick={versaoAnterior ? () => window.location.reload() : reset}
        >
          {versaoAnterior ? "Atualizar o Recreio" : "Tentar de novo"}
        </button>
        <a href="/" className="rb rb-vazado">
          Voltar ao início
        </a>
      </div>
    </main>
  );
}
