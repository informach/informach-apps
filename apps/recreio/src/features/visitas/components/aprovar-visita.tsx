"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState, useTransition } from "react";
import {
  aprovarVisitaDoMenorAction,
  aprovarVisitaDoMundoAction,
  aprovarVisitaDoMundoDoMenorAction,
} from "../actions";
import type { painelDaVisitaDoMenor } from "../painel-nativo-repository";

type Painel = Awaited<ReturnType<typeof painelDaVisitaDoMenor>>;
type Contexto = { tipo: "responsavel"; perfilId: string } | { tipo: "mundo"; perfilId?: string };
export function AprovarVisita({
  painel,
  contexto,
  voltar,
}: {
  painel: Painel;
  contexto: Contexto;
  voltar: string;
}) {
  const pronto = useHydrated(),
    [pendente, iniciar] = useTransition(),
    [confirmo, confirmar] = useState(false),
    [enviado, marcarEnviado] = useState(false),
    [mensagem, avisar] = useState(""),
    [login, pedirLogin] = useState(false);
  return (
    <form
      className="painel mt-7 grid max-w-2xl gap-5 p-5 sm:p-7"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pronto || pendente || enviado || !confirmo || !painel.aguardaSuaAprovacao) return;
        marcarEnviado(true);
        iniciar(async () => {
          try {
            const pedido = {
              conviteId: painel.convite.conviteId,
              versaoDaGestao: painel.versaoDaGestao,
              confirmo: true,
            };
            const r =
              contexto.tipo === "responsavel"
                ? await aprovarVisitaDoMenorAction({
                    conviteId: painel.convite.conviteId,
                    perfilId: contexto.perfilId,
                    versaoDaPolitica: painel.versaoDaPolitica,
                    confirmo: true,
                  })
                : contexto.perfilId
                  ? await aprovarVisitaDoMundoDoMenorAction(contexto.perfilId, pedido)
                  : await aprovarVisitaDoMundoAction(pedido);
            if (r.ok)
              avisar(
                "Sua aprovação foi registrada. A visita ainda depende das outras confirmações, do aceite de quem foi convidado e da presença do anfitrião.",
              );
            else {
              avisar(r.error);
              pedirLogin(["AUTH", "LOGIN_RECENTE"].includes(r.code));
            }
          } catch {
            avisar(
              "Não recebemos a confirmação. Volte à lista e confira a situação antes de repetir.",
            );
          }
        });
      }}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-sol">Visita com amigos</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold [overflow-wrap:anywhere]">
          {painel.nomeDoMundo}
        </h2>
        <p className="mt-3 [overflow-wrap:anywhere]">
          <strong>{painel.origem.apelido}</strong> convidou{" "}
          <strong>{painel.destino.apelido}</strong> para visitar.
        </p>
      </div>
      <p className="text-sm text-tinta-suave">
        {contexto.tipo === "responsavel"
          ? "Você autoriza somente a visita do perfil sob seus cuidados, dentro das regras atuais."
          : "Você autoriza a visita neste mundo. Cada responsável ainda confirma pelo menor sob seus cuidados."}{" "}
        A visita termina quando o anfitrião sai ou o prazo acaba. Ela pode ser encerrada antes e não
        cria participação permanente.
      </p>
      <ul className="grid gap-2 text-sm">
        <li>Decisão do mundo: {painel.convite.aguardaMundo ? "aguardando" : "confirmada"}</li>
        <li>
          Cuidados de quem convidou:{" "}
          {painel.convite.aguardaOrigem ? "aguardando responsável" : "atendidos"}
        </li>
        <li>
          Cuidados de quem foi convidado:{" "}
          {painel.convite.aguardaDestino ? "aguardando responsável" : "atendidos"}
        </li>
      </ul>
      <p className="text-sm text-tinta-suave">
        Prazo máximo:{" "}
        <time dateTime={painel.convite.expiraEm}>
          {new Date(painel.convite.expiraEm).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
        </time>{" "}
        (Brasília).
      </p>
      {painel.aguardaSuaAprovacao ? (
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
              ? "Li o convite e autorizo a visita do perfil sob meus cuidados."
              : "Li o convite e autorizo a visita neste mundo."}
          </span>
        </label>
      ) : (
        <p role="status">Sua confirmação já foi registrada.</p>
      )}
      <button
        className="rb rb-sol justify-self-start"
        type="submit"
        disabled={!pronto || pendente || enviado || !confirmo || !painel.aguardaSuaAprovacao}
      >
        {pendente ? "Confirmando…" : "Aprovar visita"}
      </button>
      {mensagem && (
        <p role="status" className="rounded-controle border border-linha bg-fundo p-4">
          {mensagem}
        </p>
      )}
      {login && (
        <a
          className="inline-flex min-h-11 items-center font-bold text-ceu underline"
          href={`/entrar?recente=1&next=${encodeURIComponent(voltar)}`}
        >
          Entrar novamente para confirmar
        </a>
      )}
      <a className="inline-flex min-h-11 items-center font-bold text-ceu underline" href={voltar}>
        Voltar e conferir situação
      </a>
    </form>
  );
}
