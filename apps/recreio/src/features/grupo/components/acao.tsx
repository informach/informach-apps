"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";

export function useAcaoDoGrupo() {
  const [erro, definirErro] = useState("");
  const [recente, definirRecente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const executar = (acao: () => Promise<ActionResult<{ destination: string }>>) => {
    definirErro("");
    definirRecente(false);
    iniciar(async () => {
      try {
        const resultado = await acao();
        if (resultado.ok) window.location.assign(resultado.data.destination);
        else {
          definirErro(resultado.error);
          definirRecente(resultado.code === "AUTH" || resultado.code === "LOGIN_RECENTE");
        }
      } catch {
        definirErro(
          "Não recebemos a confirmação. Reabra o grupo para conferir o estado atual antes de continuar.",
        );
      }
    });
  };
  return { erro, recente, pendente, executar };
}
export function ErroDaAcao({ erro, recente }: { erro: string; recente: boolean }) {
  if (!erro) return null;
  return (
    <div className="mt-4">
      <p role="alert" className="text-sm font-semibold text-coral">
        {erro}
      </p>
      <Link
        className="mt-2 inline-flex min-h-11 items-center font-bold text-ceu underline"
        href={recente ? "/entrar?recente=1&next=%2Fconta%2Fgrupo" : "/conta/grupo"}
      >
        {recente ? "Entrar novamente para confirmar" : "Reabrir grupo"}
      </Link>
    </div>
  );
}
