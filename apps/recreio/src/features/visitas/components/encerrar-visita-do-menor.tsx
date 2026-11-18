"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState, useTransition } from "react";
import { encerrarVisitaDoMenorAction, responderVisitaAction } from "../actions";

type Contexto =
  | { tipo: "responsavel"; perfilId: string }
  | { tipo: "jogador"; perfilId: string; direcao: "enviado" | "recebido" };

export function EncerrarVisitaDoJogador({
  perfilId,
  conviteId,
  direcao,
}: {
  perfilId: string;
  conviteId: string;
  direcao: "enviado" | "recebido";
}) {
  return <EncerrarVisita contexto={{ tipo: "jogador", perfilId, direcao }} conviteId={conviteId} />;
}

/** Redução continua disponível mesmo quando a presença ou a cobertura terminaram. */
export function EncerrarVisitaDoMenor({
  perfilId,
  conviteId,
}: {
  perfilId: string;
  conviteId: string;
}) {
  return <EncerrarVisita contexto={{ tipo: "responsavel", perfilId }} conviteId={conviteId} />;
}
function EncerrarVisita({ contexto, conviteId }: { contexto: Contexto; conviteId: string }) {
  const pronto = useHydrated(),
    [pendente, iniciar] = useTransition(),
    [confirmo, confirmar] = useState(false),
    [enviado, marcarEnviado] = useState(false),
    [mensagem, avisar] = useState("");
  return (
    <form
      className="grid gap-3 border-t border-linha pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pronto || pendente || enviado || !confirmo) return;
        marcarEnviado(true);
        iniciar(async () => {
          try {
            const r =
              contexto.tipo === "responsavel"
                ? await encerrarVisitaDoMenorAction({
                    perfilId: contexto.perfilId,
                    conviteId,
                    confirmo: true,
                  })
                : await responderVisitaAction(contexto.perfilId, {
                    conviteId,
                    acao: contexto.direcao === "enviado" ? "revogar" : "recusar",
                  });
            avisar(
              r.ok ? "Encerramento confirmado. Uma nova visita precisa de outro convite." : r.error,
            );
          } catch {
            avisar(
              "Não recebemos a confirmação. Atualize a lista e confira o recibo antes de repetir.",
            );
          }
        });
      }}
    >
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-ceu"
          checked={confirmo}
          onChange={(e) => confirmar(e.target.checked)}
          disabled={!pronto || pendente || enviado}
          required
        />
        <span>
          {contexto.tipo === "responsavel"
            ? "Quero encerrar este convite ou visita do perfil sob meus cuidados."
            : "Quero encerrar este convite ou visita."}
        </span>
      </label>
      <button
        className="rb rb-vazado justify-self-start"
        type="submit"
        disabled={!pronto || pendente || enviado || !confirmo}
      >
        {pendente ? "Encerrando…" : "Encerrar convite ou visita"}
      </button>
      {mensagem && (
        <p role="status" className="text-sm">
          {mensagem}
        </p>
      )}
    </form>
  );
}
