"use client";
import type { VisitasDoPerfil } from "@informach/recreio/contrato";
import { useEffect, useRef, useState, useTransition } from "react";

/** Pede a pista do próprio SID; somente o servidor atesta a conexão física. */
export function ConvidarParaVisita({
  api,
  mundoId,
  perfilId,
  disabled,
}: {
  api: VisitasDoPerfil;
  mundoId: string;
  perfilId: string;
  disabled?: boolean;
}) {
  const vivo = useRef(true),
    iniciou = useRef(false),
    [pendente, iniciar] = useTransition(),
    [enviado, marcarEnviado] = useState(false),
    [confirmado, marcarConfirmado] = useState(false),
    [mensagem, avisar] = useState("");
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  return (
    <div className="mt-4 grid gap-3 border-t border-linha pt-4">
      <p className="text-sm text-tinta-suave">
        Convide para uma visita enquanto você está neste mundo. Os responsáveis confirmam pelos
        menores, e a gestão do mundo pode precisar aprovar.
      </p>
      <button
        type="button"
        className="rb rb-vazado justify-self-start"
        disabled={disabled || pendente || enviado}
        onClick={() => {
          if (disabled || iniciou.current || !vivo.current) return;
          iniciou.current = true;
          iniciar(async () => {
            let emitiu = false;
            try {
              const propria = await api.presenca(mundoId);
              if (!vivo.current) return;
              if (!propria.presenca) {
                avisar(
                  "Sua presença ainda não foi confirmada neste mundo. Aguarde o jogo conectar e consulte novamente.",
                );
                return;
              }
              const pedido = {
                mundoId,
                perfilId,
                presencaId: propria.presenca.presencaId,
                pedidoId: crypto.randomUUID(),
              };
              emitiu = true;
              marcarEnviado(true);
              const recibo = await api.emitir(pedido);
              if (!vivo.current) return;
              marcarConfirmado(true);
              avisar(
                recibo.estado === "pending"
                  ? "Convite de visita registrado. As confirmações ficam em Visitas com amigos."
                  : "Este envio já tem uma decisão. Confira a lista de visitas.",
              );
            } catch {
              if (vivo.current)
                avisar(
                  emitiu
                    ? "Não recebemos a confirmação do envio. Confira sua lista de visitas antes de preparar outro convite."
                    : "Não foi possível consultar sua presença. Confira a conexão antes de tentar convidar.",
                );
            } finally {
              if (!emitiu) iniciou.current = false;
            }
          });
        }}
      >
        {pendente
          ? "Conferindo visita…"
          : confirmado
            ? "Convite de visita registrado"
            : enviado
              ? "Envio a conferir"
              : "Convidar para visitar"}
      </button>
      {mensagem && (
        <p role="status" className="text-sm">
          {mensagem}
        </p>
      )}
    </div>
  );
}
