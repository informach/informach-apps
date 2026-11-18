"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import {
  cancelarResponsabilidadeDoMenorAction,
  proporResponsabilidadeDoMenorAction,
} from "../responsabilidade-actions";
import type { painelDaTransferenciaDoMenor } from "../responsabilidade-infantil";

type Painel = Awaited<ReturnType<typeof painelDaTransferenciaDoMenor>>;
export function TransferenciaDoMenor({
  perfilId,
  painel,
  destino,
}: {
  perfilId: string;
  painel: Painel;
  destino: string;
}) {
  const id = useId(),
    pronto = useHydrated(),
    [membro, escolher] = useState(""),
    [confirmo, confirmar] = useState(false),
    [mensagem, avisar] = useState(""),
    [login, pedirLogin] = useState(false),
    [enviado, marcarEnviado] = useState(false),
    [pendente, iniciar] = useTransition();
  const executar = (acao: () => Promise<ActionResult<{ estado: string }>>) => {
    if (!pronto || pendente || enviado) return;
    marcarEnviado(true);
    iniciar(async () => {
      try {
        const r = await acao();
        pedirLogin(!r.ok && ["AUTH", "LOGIN_RECENTE"].includes(r.code));
        avisar(
          r.ok
            ? r.data.estado === "pending"
              ? "Proposta registrada. O adulto escolhido precisa aceitar pelo próprio login para assumir o mundo."
              : r.data.estado === "revoked"
                ? "Proposta cancelada. A responsabilidade pelo mundo foi preservada."
                : "Situação da proposta confirmada. Atualize para conferir o recibo."
            : r.error,
        );
      } catch {
        avisar(
          "Não recebemos a confirmação. Atualize esta tela e confira a proposta antes de repetir.",
        );
      }
    });
  };
  return (
    <section
      aria-label="Transferência do mundo do menor"
      className="painel mt-7 grid max-w-2xl gap-4 p-5 sm:p-6"
    >
      <h2 className="font-display text-2xl font-bold">Continuidade deste mundo</h2>
      <p className="text-tinta-suave">
        Você cuida do perfil que responde por este mundo. Pode propor que outro participante adulto
        assuma essa responsabilidade. O perfil menor continua participante, e os dados do mundo são
        preservados.
      </p>
      {painel.proposta ? (
        <>
          <p className="font-semibold [overflow-wrap:anywhere]">
            {painel.proposta.destinatario
              ? `Proposta para ${painel.proposta.destinatario}`
              : "O adulto escolhido não está disponível neste momento."}
          </p>
          <p className="text-sm text-tinta-suave">
            Válida até{" "}
            {new Date(painel.proposta.expiraEm).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}{" "}
            (Brasília).
          </p>
          {!painel.proposta.autorizacaoAtual && (
            <p>
              Os cuidados ou a gestão mudaram. Cancele esta proposta antes de preparar outra
              transferência.
            </p>
          )}
          {!painel.proposta.vigente && <p>Esta proposta venceu. Encerre-a para preparar outra.</p>}
          <button
            type="button"
            className="rb rb-vazado"
            disabled={!pronto || pendente || enviado}
            onClick={() =>
              executar(() =>
                cancelarResponsabilidadeDoMenorAction(perfilId, {
                  mundoId: painel.mundo.id,
                  pedidoId: painel.proposta?.id,
                }),
              )
            }
          >
            Cancelar proposta de transferência
          </button>
        </>
      ) : painel.podePropor ? (
        <>
          <label htmlFor={id} className="font-semibold">
            Adulto que receberá a responsabilidade
          </label>
          <select
            id={id}
            value={membro}
            onChange={(e) => escolher(e.target.value)}
            disabled={!pronto || pendente || enviado || painel.candidatos.length === 0}
            className="min-h-11 w-full min-w-0 rounded-controle border border-linha bg-fundo px-3 text-tinta"
          >
            <option value="">Escolha um participante adulto</option>
            {painel.candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido}
              </option>
            ))}
          </select>
          {painel.candidatos.length === 0 && (
            <p>
              Nenhum participante adulto disponível nesta página. É preciso que o destinatário já
              participe do mundo.
            </p>
          )}
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              checked={confirmo}
              onChange={(e) => confirmar(e.target.checked)}
              disabled={!pronto || pendente || enviado}
              className="mt-1 size-5 shrink-0 accent-ceu"
            />
            <span>
              Conferi o adulto escolhido e autorizo esta transferência se ele aceitar. O perfil sob
              meus cuidados continuará participante.
            </span>
          </label>
          <button
            type="button"
            className="rb rb-sol"
            disabled={!pronto || pendente || enviado || !confirmo || !membro}
            onClick={() =>
              executar(() =>
                proporResponsabilidadeDoMenorAction(perfilId, {
                  mundoId: painel.mundo.id,
                  membroId: membro,
                  versaoDaGestao: painel.revisao,
                  confirmo: true,
                }),
              )
            }
          >
            Propor transferência do mundo
          </button>
        </>
      ) : (
        <p>Este mundo não está disponível para uma nova transferência.</p>
      )}
      {mensagem && (
        <p role="status" className="rounded-controle border border-linha bg-fundo p-4">
          {mensagem}
        </p>
      )}
      {login && (
        <Link
          href={`/entrar?recente=1&next=${encodeURIComponent(destino)}`}
          className="inline-flex min-h-11 items-center font-bold text-ceu underline"
        >
          Entrar novamente para confirmar
        </Link>
      )}
      <Link
        href={destino}
        className="inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Atualizar transferência
      </Link>
    </section>
  );
}
