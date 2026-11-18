"use client";
import type { EstadoDeAcesso } from "@informach/recreio";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import {
  abrirPortalAction,
  conferirCompraAction,
  encerrarCompraAction,
  enviarCompraAction,
  prepararCompraAction,
} from "../actions";
import { VERSAO_DA_COMPRA } from "../constantes";
import type { consultarMinhaCobranca } from "../service";

type Estado = Awaited<ReturnType<typeof consultarMinhaCobranca>>;
const dinheiro = (valor: number) =>
  (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const periodo = (intervalo: "month" | "year") => (intervalo === "month" ? "por mês" : "por ano");
const SITUACOES: Record<EstadoDeAcesso, string> = {
  ATIVO: "Pagamento confirmado. Acesso disponível aos perfis cobertos.",
  CANCELAMENTO_AGENDADO: "Cancelamento agendado. O acesso continua até o fim do período pago.",
  PAGAMENTO_PENDENTE:
    "Pagamento em conferência. O acesso da assinatura está temporariamente indisponível.",
  ENCERRADO: "Assinatura encerrada. Seu progresso continua guardado.",
  SEM_ACESSO: "A assinatura ainda não libera acesso.",
  TESTE: "Período de teste vigente.",
  TESTE_ENCERRADO: "Período de teste encerrado.",
  SUSPENSO: "Acesso suspenso.",
  REVOGADO: "Acesso revogado.",
};

export function GerirCompra({ estado, pedidoId }: { estado: Estado; pedidoId: string }) {
  const [produtoId, selecionar] = useState("");
  const [adulto, declarar] = useState(false);
  const [aceito, aceitar] = useState(false);
  const [erro, setErro] = useState("");
  const [recente, setRecente] = useState(false);
  const [conferir, setConferir] = useState(false);
  const [pendente, iniciar] = useTransition();
  const hidratado = useHydrated();
  const compra = estado.compra,
    oferta = estado.ofertas.find((o) => o.productId === produtoId);
  const ativa = compra && !compra.resolvidoEm;

  function executar(acao: "preparar" | "encerrar" | "enviar" | "conferir" | "portal") {
    if (pendente || conferir) return;
    setErro("");
    setRecente(false);
    iniciar(async () => {
      try {
        if (acao === "portal") {
          const resposta = await abrirPortalAction();
          if (resposta.ok) window.location.assign(resposta.data.destino);
          else tratar(resposta);
          return;
        }
        if ((acao === "enviar" || acao === "conferir") && compra) {
          const resposta =
            acao === "conferir"
              ? await conferirCompraAction(compra.id)
              : await enviarCompraAction(compra.id);
          if (resposta.ok) {
            window.location.assign(
              resposta.data.tipo === "checkout" ? resposta.data.destino : "/conta/assinatura",
            );
            return;
          }
          tratar(resposta);
          return;
        }
        const resposta =
          acao === "encerrar" && compra
            ? await encerrarCompraAction(compra.id)
            : oferta
              ? await prepararCompraAction({
                  pedidoId,
                  produtoId: oferta.productId,
                  valorCentavos: oferta.amountCents,
                  moeda: oferta.currency,
                  intervalo: oferta.interval,
                  souAdulto: adulto,
                  aceitoCobrancaRecorrente: aceito,
                  versaoDasCondicoes: VERSAO_DA_COMPRA,
                  versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
                })
              : null;
        if (!resposta) return;
        if (resposta.ok) {
          window.location.assign("/conta/assinatura");
          return;
        }
        tratar(resposta);
      } catch {
        setErro("A resposta não chegou. Confira seu pedido antes de fazer outro envio.");
        setConferir(true);
      }
    });
  }
  function tratar(resposta: { code: string; error: string }) {
    const desconhecida =
      resposta.code === "UNEXPECTED" || resposta.code === "COBRANCA_EM_CONFERENCIA";
    setErro(
      desconhecida
        ? "Não foi possível confirmar a resposta. Confira seu pedido antes de tentar novamente."
        : resposta.error,
    );
    setRecente(resposta.code === "AUTH" || resposta.code === "LOGIN_RECENTE");
    setConferir(desconhecida);
  }
  const bloqueado = !hidratado || pendente || conferir;
  return (
    <>
      {estado.modo === "off" && (
        <p className="painel mt-6 p-5">
          As assinaturas ainda não estão disponíveis. O alfa continua por convite.
        </p>
      )}
      {estado.modo === "setup" && (
        <p className="painel mt-6 p-5">
          A compra ainda não está disponível. Você pode conferir uma oferta e registrar sua
          autorização. Isso não gera cobrança.
        </p>
      )}
      {estado.modo === "sandbox" && (
        <p className="painel mt-6 p-5 font-semibold">
          Ambiente de homologação: os envios usam pagamento de teste e não geram cobrança real.
        </p>
      )}
      {estado.financeiro.assinatura && (
        <section aria-labelledby="situacao-da-assinatura" className="painel mt-6 p-5 sm:p-6">
          <h2 id="situacao-da-assinatura" className="font-display text-xl font-bold">
            Situação da assinatura
          </h2>
          <p className="mt-3 font-bold">
            {estado.ofertas.find((o) => o.productId === estado.financeiro.assinatura?.produtoId)
              ?.nome ?? "Sua assinatura"}
          </p>
          <p className="mt-3 text-tinta-suave">{SITUACOES[estado.financeiro.assinatura.estado]}</p>
          <p className="mt-3 text-sm text-tinta-suave">
            Período atual até{" "}
            <time dateTime={estado.financeiro.assinatura.fimDoPeriodo}>
              {new Date(estado.financeiro.assinatura.fimDoPeriodo).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short",
              })}
            </time>
            .
          </p>
        </section>
      )}
      {estado.portalDisponivel && (
        <section aria-labelledby="pagamento-e-cancelamento" className="painel mt-6 p-5 sm:p-6">
          <h2 id="pagamento-e-cancelamento" className="font-display text-xl font-bold">
            Pagamento e cancelamento
          </h2>
          <p className="mt-3 text-tinta-suave">
            Consulte suas faturas, atualize o pagamento ou cancele a renovação. O cancelamento
            mantém o período já pago e o progresso dos jogadores.
          </p>
          <button
            type="button"
            className="rb rb-vazado mt-4"
            disabled={bloqueado}
            onClick={() => executar("portal")}
          >
            Abrir gestão de pagamento
          </button>
        </section>
      )}
      {compra && (
        <section aria-labelledby="recibo-da-compra" className="painel mt-6 p-5 sm:p-6">
          <h2 id="recibo-da-compra" className="font-display text-xl font-bold">
            Seu pedido
          </h2>
          <p className="mt-3 font-bold">
            {estado.ofertas.find((o) => o.productId === compra.produtoId)?.nome ??
              "Oferta registrada"}
          </p>
          <p className="mt-2 text-tinta-suave">
            {dinheiro(compra.valorCentavos)} {periodo(compra.intervalo)}, com renovação automática.
          </p>
          <p className="mt-3 text-tinta-suave">
            {compra.resolucao === "not_started"
              ? "Pedido encerrado antes do envio."
              : compra.resolucao === "expired_unpaid"
                ? "Sessão de pagamento expirada sem assinatura."
                : compra.resolucao === "checkout_completed"
                  ? "Pedido concluído. Confira acima a situação atual da assinatura."
                  : compra.emConferencia
                    ? "Pedido em conferência. Aguarde a confirmação antes de fazer outra compra."
                    : compra.tentativaIniciadaEm
                      ? "Envio registrado. A assinatura depende da confirmação do pagamento."
                      : "Autorização registrada. Nenhuma compra foi enviada."}
          </p>
          <p className="mt-3 text-sm text-tinta-suave">
            Registrar este pedido ou voltar da página de pagamento não libera jogos. Você pode
            administrar a conta sem ocupar um perfil de jogador.
          </p>
          {ativa && !compra.tentativaIniciadaEm && (
            <button
              type="button"
              className="rb rb-vazado mt-4"
              disabled={bloqueado}
              onClick={() => executar("encerrar")}
            >
              Encerrar pedido não enviado
            </button>
          )}
          {ativa && estado.modo === "sandbox" && (
            <button
              type="button"
              className="rb rb-sol mt-4"
              disabled={bloqueado}
              onClick={() => executar(compra.tentativaIniciadaEm ? "conferir" : "enviar")}
            >
              {compra.tentativaIniciadaEm
                ? "Conferir envio no ambiente de teste"
                : "Continuar no ambiente de teste"}
            </button>
          )}
        </section>
      )}
      {!ativa && estado.financeiro.podeContratar && estado.modo !== "off" && (
        <form
          aria-labelledby="autorizar-compra"
          className="painel mt-6 p-5 sm:p-6"
          onSubmit={(evento) => {
            evento.preventDefault();
            executar("preparar");
          }}
        >
          <h2 id="autorizar-compra" className="font-display text-xl font-bold">
            Conferir e autorizar uma oferta
          </h2>
          <fieldset className="mt-4 grid gap-3">
            <legend className="mb-3 font-bold">Escolha seu plano e período</legend>
            {estado.ofertas.map((o) => (
              <label
                key={o.productId}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-current/20 p-4"
              >
                <input
                  type="radio"
                  name="produto"
                  value={o.productId}
                  required
                  checked={produtoId === o.productId}
                  className="mt-1 size-5 shrink-0"
                  onChange={() => {
                    selecionar(o.productId);
                    aceitar(false);
                  }}
                />
                <span>
                  <span className="block font-bold">{o.nome}</span>
                  <span className="mt-1 block">
                    {dinheiro(o.amountCents)} {periodo(o.interval)}
                  </span>
                  <span className="mt-1 block text-sm text-tinta-suave">
                    {o.perfis === 1
                      ? "Um perfil de jogador."
                      : `Até ${o.perfis} perfis de jogadores.`}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {oferta && (
            <p className="mt-4 text-tinta-suave">
              Você escolheu {oferta.nome}: {dinheiro(oferta.amountCents)} {periodo(oferta.interval)}
              , cobrado a cada {oferta.interval === "month" ? "mês" : "ano"} até o cancelamento.
            </p>
          )}
          <label className="mt-5 flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              required
              checked={adulto}
              onChange={(e) => declarar(e.target.checked)}
              className="mt-1 size-5 shrink-0"
            />
            <span>
              Declaro ter 18 anos ou mais e assumo a responsabilidade pelos perfis que cadastrar.
            </span>
          </label>
          <label className="mt-3 flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              required
              checked={aceito}
              onChange={(e) => aceitar(e.target.checked)}
              className="mt-1 size-5 shrink-0"
            />
            <span>
              Conferi o plano, o valor e o período e autorizo a cobrança recorrente da oferta
              escolhida.
            </span>
          </label>
          <p className="mt-3 text-sm text-tinta-suave">
            Confira os{" "}
            <Link href="/termos" className="font-bold text-ceu underline">
              termos
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="font-bold text-ceu underline">
              privacidade
            </Link>
            . Registrar a autorização ainda não envia a compra.
          </p>
          <button
            type="submit"
            className="rb rb-sol mt-5"
            disabled={bloqueado || !oferta || !adulto || !aceito}
          >
            {pendente ? "Confirmando…" : "Registrar autorização de compra"}
          </button>
        </form>
      )}
      {erro && (
        <p role="alert" className="mt-5 font-semibold text-erro">
          {erro}
        </p>
      )}
      {conferir && (
        <a href="/conta/assinatura" className="rb rb-vazado mt-4">
          Conferir meu pedido
        </a>
      )}
      {recente && (
        <Link href="/entrar?recente=1&next=%2Fconta%2Fassinatura" className="rb rb-vazado mt-4">
          Entrar novamente
        </Link>
      )}
    </>
  );
}
