"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";

export function useAcaoSocial(destino: string) {
  const [erro, definirErro] = useState("");
  const [retomar, definirRetomar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const executar = <T,>(acao: () => Promise<ActionResult<T>>, confirmado?: (dados: T) => void) => {
    definirErro("");
    definirRetomar(false);
    iniciar(async () => {
      try {
        const resultado = await acao();
        if (resultado.ok) {
          if (confirmado) confirmado(resultado.data);
          else window.location.assign(destino);
        } else {
          definirErro(resultado.error);
          definirRetomar(
            [
              "AUTH",
              "LOGIN_RECENTE",
              "NAO_AUTENTICADO",
              "SESSAO_INVALIDA",
              "SESSAO_ENCERRADA",
            ].includes(resultado.code),
          );
        }
      } catch {
        definirErro(
          "Não recebemos a confirmação. Atualize os contatos para conferir antes de continuar.",
        );
      }
    });
  };
  return { erro, retomar, pendente, executar };
}
export function ErroSocial({
  erro,
  retomar,
  destino,
  acesso,
}: {
  erro: string;
  retomar: boolean;
  destino: string;
  acesso: string;
}) {
  if (!erro) return null;
  return (
    <div className="mt-4">
      <p role="alert" className="text-sm font-semibold text-coral">
        {erro}
      </p>
      <Link
        className="mt-2 inline-flex min-h-11 items-center font-bold text-ceu underline"
        href={retomar ? acesso : destino}
      >
        {retomar ? "Conferir acesso para continuar" : "Atualizar contatos"}
      </Link>
    </div>
  );
}
