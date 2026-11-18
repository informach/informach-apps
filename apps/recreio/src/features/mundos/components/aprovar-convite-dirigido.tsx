"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState, useTransition } from "react";
import {
  aprovarConviteDoMenorAction,
  aprovarConviteDoMundoAction,
  aprovarConviteDoMundoDoMenorAction,
} from "../convites-dirigidos-actions";
import type { painelDoConviteDoMenor } from "../convites-dirigidos-painel-repository";

type Painel = Awaited<ReturnType<typeof painelDoConviteDoMenor>>;
type Contexto = { tipo: "responsavel"; perfilId: string } | { tipo: "mundo"; perfilId?: string };
export function AprovarConviteDirigido({
  painel,
  contexto,
  voltar,
}: {
  painel: Painel;
  contexto: Contexto;
  voltar: string;
}) {
  const pronto = useHydrated(),
    [pendente, iniciar] = useTransition();
  const [confirmo, confirmar] = useState(false),
    [enviado, marcarEnviado] = useState(false),
    [mensagem, avisar] = useState(""),
    [login, pedirLogin] = useState(false);
  const aguardando = painel.aguardaSuaAprovacao;
  return (
    <form
      className="painel mt-7 grid max-w-2xl gap-5 p-5 sm:p-7"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!pronto || pendente || enviado || !confirmo || !aguardando) return;
        marcarEnviado(true);
        avisar("");
        pedirLogin(false);
        iniciar(async () => {
          try {
            const resposta =
              contexto.tipo === "responsavel"
                ? await aprovarConviteDoMenorAction({
                    conviteId: painel.convite.conviteId,
                    perfilId: contexto.perfilId,
                    versaoDaPolitica: painel.versaoDaPolitica,
                    confirmo: true,
                  })
                : contexto.perfilId
                  ? await aprovarConviteDoMundoDoMenorAction(contexto.perfilId, {
                      conviteId: painel.convite.conviteId,
                      versaoDaGestao: painel.versaoDaGestao,
                      confirmo: true,
                    })
                  : await aprovarConviteDoMundoAction({
                      conviteId: painel.convite.conviteId,
                      versaoDaGestao: painel.versaoDaGestao,
                      confirmo: true,
                    });
            if (resposta.ok)
              avisar(
                "Sua aprovação foi registrada. O convite continua dependendo das outras confirmações e do aceite de quem foi convidado.",
              );
            else {
              avisar(resposta.error);
              pedirLogin(["AUTH", "LOGIN_RECENTE"].includes(resposta.code));
            }
          } catch {
            avisar(
              "Não recebemos a confirmação. Volte à lista e confira o recibo antes de repetir.",
            );
          }
        });
      }}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-sol">Convite de mundo</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold [overflow-wrap:anywhere]">
          {painel.nomeDoMundo}
        </h2>
        <p className="mt-3 [overflow-wrap:anywhere]">
          <strong>{painel.origem.apelido}</strong> convidou{" "}
          <strong>{painel.destino.apelido}</strong> para participar.
        </p>
      </div>
      <p className="text-sm text-tinta-suave">
        {contexto.tipo === "responsavel"
          ? "Você confirma a participação do perfil sob seus cuidados. O convite não libera conteúdo fora das regras que você definiu."
          : "Você autoriza a entrada neste mundo. Cada perfil continua sujeito ao próprio acesso e aos cuidados de seu responsável."}
      </p>
      <p className="text-sm font-semibold">Confirmações ao abrir este convite</p>
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
        Válido até{" "}
        <time dateTime={painel.convite.expiraEm}>
          {new Date(painel.convite.expiraEm).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
        </time>{" "}
        (Brasília).
      </p>
      {aguardando ? (
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0 accent-ceu"
            checked={confirmo}
            disabled={!pronto || pendente || enviado}
            onChange={(e) => confirmar(e.target.checked)}
            required
          />
          <span>
            Li o convite e autorizo{" "}
            {contexto.tipo === "responsavel"
              ? "a participação do perfil sob meus cuidados"
              : "a entrada neste mundo"}
            .
          </span>
        </label>
      ) : (
        <p role="status">Sua confirmação já foi registrada.</p>
      )}
      <button
        type="submit"
        className="rb rb-sol"
        disabled={!pronto || pendente || enviado || !confirmo || !aguardando}
      >
        {pendente ? "Confirmando…" : "Registrar aprovação"}
      </button>
      {mensagem && (
        <p role="status" className="rounded-controle border border-linha bg-fundo p-4">
          {mensagem}
        </p>
      )}
      {login && (
        <a href="/entrar" className="min-h-11 font-bold text-ceu underline">
          Entrar novamente para confirmar
        </a>
      )}
      <a href={voltar} className="inline-flex min-h-11 items-center font-bold text-ceu underline">
        Voltar e conferir os convites
      </a>
    </form>
  );
}
