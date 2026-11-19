"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  cancelarRenovacaoAction,
  consultarCancelamentoDaRenovacaoAction,
} from "../renovacao-actions";
import { VERSAO_DO_CANCELAMENTO_DA_RENOVACAO } from "../renovacao-contrato";
import type { consultarMinhaCobranca } from "../service";

type Estado = Awaited<ReturnType<typeof consultarMinhaCobranca>>;
type Recibo = NonNullable<NonNullable<Estado["trocas"]>["cancelamentoDaRenovacao"]>;
const data = (valor: string) =>
  new Date(valor).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
const SITUACOES: Record<Recibo["estado"], string> = {
  accepted: "Pedido recebido. A interrupção da renovação ainda aguarda confirmação.",
  attempted: "Cancelamento em processamento. A interrupção da renovação ainda não está confirmada.",
  review:
    "A interrupção da renovação precisa de conferência. Seu pedido está guardado e será retomado.",
  confirmed: "Interrupção da renovação confirmada.",
};

export function GerirRenovacao({ estado, pedidoId }: { estado: Estado; pedidoId: string }) {
  const [recibo, definirRecibo] = useState(estado.trocas?.cancelamentoDaRenovacao ?? null);
  const [aceito, aceitar] = useState(false),
    [erro, definirErro] = useState("");
  const [incerta, definirIncerta] = useState(false),
    [recente, definirRecente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const hidratado = useHydrated();
  const contrato = estado.trocas?.contrato;
  if (!contrato && !recibo) return null;
  if (!recibo && !estado.cancelamentoDaRenovacaoDisponivel) return null;
  const bloqueado = !hidratado || pendente;
  function agir(consultar: boolean) {
    if (bloqueado || (!consultar && (incerta || !aceito || !contrato))) return;
    definirErro("");
    definirRecente(false);
    iniciar(async () => {
      try {
        const resposta = consultar
          ? await consultarCancelamentoDaRenovacaoAction({ pedidoId: recibo?.pedidoId ?? pedidoId })
          : contrato
            ? await cancelarRenovacaoAction({
                pedidoId,
                assinaturaId: contrato.assinaturaId,
                revisaoDoContrato: contrato.revisao,
                confirmoCancelamentoDaRenovacao: aceito,
                versaoDasCondicoes: VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
              })
            : null;
        if (!resposta) return;
        if (resposta.ok) {
          definirRecibo(resposta.data);
          definirIncerta(false);
          // Refresh the saved quote/contract as well: acceptance may have closed
          // a never-sent plan proposal in the same native transaction.
          window.location.hash = "cancelar-renovacao";
          window.location.reload();
          return;
        }
        definirErro(resposta.error);
        definirRecente(resposta.code === "AUTH" || resposta.code === "LOGIN_RECENTE");
        definirIncerta(
          resposta.code === "UNEXPECTED" || resposta.code === "COBRANCA_EM_CONFERENCIA",
        );
      } catch {
        definirErro("A resposta não chegou. Confira este mesmo pedido antes de tentar novamente.");
        definirIncerta(true);
      }
    });
  }
  return (
    <section
      id="cancelar-renovacao"
      aria-labelledby="titulo-cancelar-renovacao"
      className="painel mt-6 p-5 sm:p-6"
    >
      <h2 id="titulo-cancelar-renovacao" className="font-display text-xl font-bold">
        Cancelar renovação
      </h2>
      <p className="mt-3 text-tinta-suave">
        O cancelamento interrompe as próximas renovações e conserva o tempo já pago. Ele não exclui
        perfis, progresso ou mundos e não encerra sua conta.
      </p>
      {recibo ? (
        <>
          <p className="mt-4 font-bold" role="status">
            {SITUACOES[recibo.estado]}
          </p>
          {recibo.estado === "confirmed" && (
            <p className="mt-3 text-tinta-suave">
              {recibo.resultado === "terminal"
                ? "A assinatura já está encerrada no provedor."
                : recibo.renovacaoInterrompidaEm
                  ? `A renovação será interrompida em ${data(recibo.renovacaoInterrompidaEm)}.`
                  : "Confira a situação da assinatura acima."}
            </p>
          )}
          <p className="mt-3 text-sm text-tinta-suave">
            Pedido recebido em <time dateTime={recibo.aceitoEm}>{data(recibo.aceitoEm)}</time>.
          </p>
        </>
      ) : (
        <label className="mt-4 flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={aceito}
            disabled={bloqueado || incerta}
            onChange={(event) => aceitar(event.target.checked)}
            className="mt-1 size-5 shrink-0"
          />
          <span>
            Quero cancelar a renovação desta assinatura. Entendo que meu período já pago continua
            disponível.
          </span>
        </label>
      )}
      {!recibo && !incerta && (
        <button
          type="button"
          className="rb rb-vazado mt-4"
          disabled={bloqueado || !aceito}
          onClick={() => agir(false)}
        >
          Confirmar cancelamento da renovação
        </button>
      )}
      {(recibo || incerta) && (
        <button
          type="button"
          className="rb rb-vazado mt-4"
          disabled={bloqueado}
          onClick={() => agir(true)}
        >
          Conferir pedido de cancelamento
        </button>
      )}
      {erro && (
        <p role="alert" className="mt-4 text-sm font-semibold">
          {erro}
        </p>
      )}
      {recente && (
        <Link
          href="/entrar?retorno=%2Fconta%2Fassinatura"
          className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
        >
          Entrar novamente
        </Link>
      )}
    </section>
  );
}
