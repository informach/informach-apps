"use client";
import type {
  DetalheDeConviteDeVisita,
  ResultadoDaDecisaoDeVisita,
} from "@informach/recreio/contrato";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState, useTransition } from "react";
import { responderVisitaAction } from "../actions";
import { caminhoDaVisita } from "../navegacao";

export function DecisaoDaVisita({
  perfilId,
  detalhe,
  direcao,
}: {
  perfilId: string;
  detalhe: DetalheDeConviteDeVisita;
  direcao: "enviado" | "recebido";
}) {
  const pronto = useHydrated(),
    [pendente, iniciar] = useTransition(),
    [recibo, guardar] = useState<ResultadoDaDecisaoDeVisita>(detalhe),
    [enviado, marcarEnviado] = useState(false),
    [mensagem, avisar] = useState("");
  const aguarda =
    detalhe.convite.aguardaMundo || detalhe.convite.aguardaOrigem || detalhe.convite.aguardaDestino;
  const responder = (acao: "aceitar" | "recusar" | "revogar") => {
    if (!pronto || pendente || enviado) return;
    marcarEnviado(true);
    iniciar(async () => {
      try {
        const resposta = await responderVisitaAction(perfilId, {
          conviteId: detalhe.convite.conviteId,
          acao,
        });
        if (resposta.ok) {
          guardar(resposta.data);
          avisar(
            acao === "aceitar"
              ? "Convite aceito. Confira a entrada enquanto seu amigo estiver neste mundo."
              : "Encerramento confirmado. Uma nova visita precisa de outro convite.",
          );
        } else avisar(resposta.error);
      } catch {
        avisar(
          "Não recebemos a confirmação. Atualize esta página e confira o recibo antes de repetir.",
        );
      }
    });
  };
  const podeConferirEntrada =
    direcao === "recebido" &&
    recibo.convite.estado === "accepted" &&
    recibo.visita?.estado === "active";
  return (
    <section
      className="painel mt-7 grid max-w-2xl gap-5 p-5 sm:p-7"
      aria-label="Decidir sobre a visita"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-sol">Encontro com amigos</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold [overflow-wrap:anywhere]">
          {detalhe.nomeDoMundo}
        </h2>
        <p className="mt-3 [overflow-wrap:anywhere]">
          <strong>{detalhe.origem.apelido}</strong> convidou{" "}
          <strong>{detalhe.destino.apelido}</strong> para visitar.
        </p>
      </div>
      <p className="text-sm text-tinta-suave">
        A visita termina quando o anfitrião sai ou o prazo acaba, e pode ser encerrada antes. Ela
        não acrescenta uma participação permanente à sua estante.
      </p>
      <ul className="grid gap-2 text-sm">
        <li>Decisão do mundo: {detalhe.convite.aguardaMundo ? "aguardando" : "atendida"}</li>
        <li>
          Cuidados de quem convidou:{" "}
          {detalhe.convite.aguardaOrigem ? "aguardando responsável" : "atendidos"}
        </li>
        <li>
          Cuidados de quem foi convidado:{" "}
          {detalhe.convite.aguardaDestino ? "aguardando responsável" : "atendidos"}
        </li>
      </ul>
      {aguarda && recibo.convite.estado === "pending" && (
        <p>O convite ainda depende das confirmações acima.</p>
      )}
      {mensagem && (
        <p role="status" className="rounded-controle border border-linha bg-fundo p-4">
          {mensagem}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {direcao === "recebido" && recibo.convite.estado === "pending" && (
          <button
            type="button"
            className="rb rb-sol"
            disabled={!pronto || pendente || enviado || aguarda}
            onClick={() => responder("aceitar")}
          >
            Aceitar visita
          </button>
        )}
        {(recibo.convite.estado === "pending" || recibo.visita?.estado === "active") && (
          <button
            type="button"
            className="rb rb-vazado"
            disabled={!pronto || pendente || enviado}
            onClick={() => responder(direcao === "enviado" ? "revogar" : "recusar")}
          >
            {recibo.convite.estado === "accepted"
              ? "Encerrar visita"
              : direcao === "enviado"
                ? "Cancelar convite"
                : "Recusar convite"}
          </button>
        )}
        {podeConferirEntrada && recibo.visita && (
          <a
            className="rb rb-sol"
            href={caminhoDaVisita({
              jogo: recibo.convite.jogo,
              mundoId: recibo.convite.mundoId,
              visitaId: recibo.visita.visitaId,
            })}
          >
            Conferir entrada no mundo
          </a>
        )}
        <a className="rb rb-vazado" href={`/visitas/${detalhe.convite.conviteId}`}>
          Atualizar situação
        </a>
      </div>
    </section>
  );
}
