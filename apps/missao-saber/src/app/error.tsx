"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Mascote } from "@/components/mascote";
import { BotaoChapa } from "@/components/ui/botao-chapa";

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
    <main id="conteudo" className="mx-auto max-w-lg px-4 py-16 text-center">
      <Mascote humor="encorajando" tamanho="g" className="mx-auto" />
      <h1 className="mt-4 font-display text-2xl font-semibold text-tinta">
        Não conseguimos abrir esta parte da jornada.
      </h1>
      <p className="mt-3 mb-6 text-tinta-suave">
        As respostas já confirmadas continuam salvas. Tente carregar novamente.
      </p>
      <BotaoChapa type="button" medida="g" onClick={reset}>
        Tentar novamente
      </BotaoChapa>
      <p className="mt-5">
        <a href="/hoje" className="font-semibold underline underline-offset-4">
          Voltar ao início
        </a>
      </p>
    </main>
  );
}
