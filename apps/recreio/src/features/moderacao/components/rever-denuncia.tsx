"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useRef, useState, useTransition } from "react";
import { reverDenunciaAction, reverDenunciaComoGestorAction } from "../acompanhamento-actions";

export function ReverDenuncia({
  perfilId,
  protocolo,
  revisao,
  gestor,
  destino,
}: {
  perfilId: string;
  protocolo: string;
  revisao: number;
  gestor: boolean;
  destino: string;
}) {
  const pronto = useHydrated(),
    tentativa = useRef<string | null>(null);
  const [pendente, iniciar] = useTransition(),
    [recebido, definirRecebido] = useState(false),
    [erro, definirErro] = useState(""),
    [retomar, definirRetomar] = useState(false);
  return (
    <div className="mt-4 border-t border-linha pt-4">
      <p className="text-sm text-tinta-suave">
        Você pode pedir uma nova análise desta resposta uma vez. O pedido não suspende ninguém nem
        muda o acesso aos jogos automaticamente.
      </p>
      <button
        type="button"
        className="rb rb-vazado mt-3"
        disabled={!pronto || pendente || recebido}
        onClick={() => {
          tentativa.current ??= crypto.randomUUID();
          const entrada = { protocolo, versaoDoCaso: revisao, recursoId: tentativa.current };
          definirErro("");
          definirRetomar(false);
          iniciar(async () => {
            try {
              const resposta = await (gestor
                ? reverDenunciaComoGestorAction(perfilId, entrada)
                : reverDenunciaAction(perfilId, entrada));
              if (resposta.ok) definirRecebido(true);
              else {
                definirErro(resposta.error);
                definirRetomar(gestor && ["AUTH", "LOGIN_RECENTE"].includes(resposta.code));
              }
            } catch {
              definirErro(
                "Não recebemos a confirmação. Atualize o protocolo para conferir antes de enviar novamente.",
              );
            }
          });
        }}
      >
        {pendente ? "Enviando pedido…" : "Pedir revisão da resposta"}
      </button>
      {recebido && (
        <p role="status" className="mt-3 font-semibold">
          Pedido de revisão recebido. O protocolo continua o mesmo.
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-3 text-sm text-coral">
          {erro}
        </p>
      )}
      {(recebido || erro) && (
        <a
          href={`${destino}?protocolo=${protocolo}`}
          className="mt-2 inline-flex min-h-11 items-center font-bold text-ceu underline"
        >
          Atualizar este protocolo
        </a>
      )}
      {retomar && (
        <a
          href={`/entrar?recente=1&next=${encodeURIComponent(`${destino}?protocolo=${protocolo}`)}`}
          className="mt-2 flex min-h-11 items-center font-bold text-ceu underline"
        >
          Entrar novamente para confirmar
        </a>
      )}
    </div>
  );
}
