"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { pedirRevisaoDaRestricaoAction } from "../recurso-actions";

export function PedirRevisao({
  perfilId,
  versaoDoPerfil,
}: {
  perfilId: string;
  versaoDoPerfil: number;
}) {
  const pronto = useHydrated(),
    router = useRouter();
  const tentativa = useRef<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [erro, definirErro] = useState("");
  const [retomar, definirRetomar] = useState(false);
  const [protocolo, definirProtocolo] = useState("");
  const destino = `/conta/perfis/${perfilId}/restricao`;
  return (
    <div className="painel mt-6 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">Pedir revisão da suspensão</h2>
      <p className="mt-3 text-tinta-suave">
        A equipe vai analisar o acesso deste perfil. Você não precisa ter um plano ativo para pedir
        revisão. O envio não libera o jogo automaticamente.
      </p>
      <button
        type="button"
        className="rb rb-sol mt-4"
        disabled={!pronto || pendente || !!protocolo}
        onClick={() => {
          tentativa.current ??= crypto.randomUUID();
          const recursoId = tentativa.current;
          definirErro("");
          definirRetomar(false);
          iniciar(async () => {
            try {
              const resultado = await pedirRevisaoDaRestricaoAction({
                perfilId,
                versaoDoPerfil,
                recursoId,
              });
              if (resultado.ok) {
                definirProtocolo(resultado.data.protocolo);
                router.refresh();
              } else {
                definirErro(resultado.error);
                definirRetomar(
                  ["AUTH", "LOGIN_RECENTE", "SESSAO_INVALIDA"].includes(resultado.code),
                );
              }
            } catch {
              definirErro(
                "Não recebemos a confirmação. Atualize esta página para conferir se o pedido chegou antes de enviar novamente.",
              );
            }
          });
        }}
      >
        {pendente ? "Enviando pedido…" : "Solicitar revisão"}
      </button>
      {protocolo && (
        <div role="status" className="mt-4">
          <p className="font-semibold">Pedido recebido.</p>
          <p className="mt-1 break-all font-mono text-sm">{protocolo}</p>
        </div>
      )}
      {erro && (
        <div className="mt-4">
          <p role="alert" className="text-coral">
            {erro}
          </p>
          <Link
            href={retomar ? `/entrar?recente=1&next=${encodeURIComponent(destino)}` : destino}
            className="mt-2 inline-flex min-h-11 items-center font-bold text-ceu underline"
          >
            {retomar ? "Entrar novamente para confirmar" : "Atualizar situação do pedido"}
          </Link>
        </div>
      )}
    </div>
  );
}
