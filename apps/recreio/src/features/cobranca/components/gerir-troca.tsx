"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { consultarMinhaCobranca } from "../service";
import {
  aceitarTrocaAction,
  cancelarReducaoAction,
  conferirTrocaAction,
  encerrarTrocaAction,
  enviarTrocaAction,
  prepararTrocaAction,
} from "../troca-actions";
import { classificarOfertasDaTroca } from "../troca-classificacao";

type Estado = Awaited<ReturnType<typeof consultarMinhaCobranca>>;
type Pedido = NonNullable<NonNullable<Estado["trocas"]>["pedido"]>;
const SITUACOES: Record<Pedido["estado"], string> = {
  quoted: "Cotação pronta para conferir",
  accepted: "Troca autorizada e ainda não enviada",
  sent: "Troca enviada para conferência",
  scheduled: "Troca agendada",
  applied: "Troca aplicada ao contrato",
  canceled: "Pedido de troca encerrado",
  failed: "Troca não concluída",
};
const dinheiro = (valor: number) =>
  (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (valor: string) =>
  new Date(valor).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });

export function GerirTroca({ estado, pedidoId }: { estado: Estado; pedidoId: string }) {
  const [destino, escolher] = useState("");
  const [aceito, aceitar] = useState(false);
  const [erro, definirErro] = useState("");
  const [incerta, definirIncerta] = useState(false);
  const [recente, definirRecente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [perfis, selecionar] = useState(() =>
    estado.perfis.map((p) => ({
      perfilId: p.perfilId,
      versao: p.versao,
      cobrir: p.ativo && p.selecionado,
    })),
  );
  const hidratado = useHydrated();
  const trocas = estado.trocas,
    pedido = trocas?.pedido,
    contrato = trocas?.contrato;
  const oferta = estado.ofertas.find((o) => o.productId === destino);
  const origem = estado.ofertas.find((o) => o.productId === contrato?.produtoId);
  const andamento = Boolean(pedido && pedido.resolvidoEm === null);
  const excede = Boolean(oferta && perfis.filter((p) => p.cobrir).length > oferta.perfis);
  const bloqueado = !hidratado || pendente || incerta;
  const preparar =
    estado.modo === "sandbox" &&
    estado.conferenciaDisponivel &&
    contrato?.podePreparar &&
    origem &&
    !andamento;

  function agir(acao: "cotar" | "aceitar" | "enviar" | "conferir" | "encerrar" | "cancelar") {
    if (bloqueado || (acao === "cotar" && excede)) return;
    definirErro("");
    definirRecente(false);
    iniciar(async () => {
      try {
        let resposta: Awaited<ReturnType<typeof aceitarTrocaAction>> | undefined;
        if (acao === "cotar" && trocas && contrato && oferta && origem) {
          const tipo = classificarOfertasDaTroca(origem, oferta).tipo;
          resposta = await prepararTrocaAction(tipo, {
            pedidoId,
            grupoId: trocas.grupoId,
            produtoDestino: oferta.productId,
            revisaoContrato: contrato.revisao,
            perfis,
          });
        } else if (pedido) {
          if (acao === "aceitar")
            resposta = await aceitarTrocaAction({
              pedidoId: pedido.id,
              produtoDestino: pedido.produtoDestino,
              revisaoContrato: pedido.revisaoContrato,
              valorAgoraCentavos: pedido.valorAgoraCentavos,
              subtotalCentavos: pedido.subtotalCentavos,
              creditoCentavos: pedido.creditoCentavos,
              totalCentavos: pedido.totalCentavos,
              saldoAnteriorCentavos: pedido.saldoAnteriorCentavos,
              valorRenovacaoCentavos: pedido.valorRenovacaoCentavos,
              intervalo: pedido.intervalo,
              moeda: pedido.moeda,
              vigencia: pedido.vigencia,
              versaoDasCondicoes: pedido.versaoDasCondicoes,
              aceitoTrocaECobrancaRecorrente: aceito,
            });
          if (acao === "enviar") resposta = await enviarTrocaAction(pedido.tipo, pedido.id);
          if (acao === "conferir") resposta = await conferirTrocaAction(pedido.tipo, pedido.id);
          if (acao === "encerrar") resposta = await encerrarTrocaAction(pedido.id);
          if (acao === "cancelar") resposta = await cancelarReducaoAction(pedido.id);
        }
        if (!resposta) return;
        if (resposta.ok) {
          // A fragment navigation alone does not fetch the committed receipt.
          // Reload also reinitializes the complete current profile inventory.
          window.location.hash = "troca-de-plano";
          window.location.reload();
          return;
        }
        definirErro(resposta.error);
        definirRecente(resposta.code === "AUTH" || resposta.code === "LOGIN_RECENTE");
        definirIncerta(
          resposta.code === "UNEXPECTED" || resposta.code === "COBRANCA_EM_CONFERENCIA",
        );
      } catch {
        definirErro("A resposta não chegou. Recarregue o pedido antes de fazer outro envio.");
        definirIncerta(true);
      }
    });
  }
  if (!trocas || (!contrato && !pedido)) return null;
  const vencida =
    pedido && !pedido.aceitoEm && new Date(pedido.aceitarAte) <= new Date(trocas.conferidoEm);
  const novaOferta = pedido && estado.ofertas.find((o) => o.productId === pedido.produtoDestino);
  return (
    <section aria-labelledby="troca-de-plano" className="painel mt-6 p-5 sm:p-6">
      <h2 id="troca-de-plano" className="font-display text-xl font-bold">
        Troca de plano
      </h2>
      <p className="mt-3 text-tinta-suave">
        Confira valores, data e jogadores antes de autorizar. Perfis e progresso continuam
        guardados.
      </p>
      {pedido && (
        <section
          aria-label="Pedido de troca"
          className="mt-5 rounded-2xl border border-current/20 p-4"
        >
          <p className="font-bold">{SITUACOES[pedido.estado]}</p>
          <p className="mt-2">{novaOferta?.nome ?? "Oferta registrada"}</p>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <dt>Subtotal</dt>
            <dd className="font-bold sm:text-right">{dinheiro(pedido.subtotalCentavos)}</dd>
            <dt>Crédito proporcional</dt>
            <dd className="font-bold sm:text-right">{dinheiro(pedido.creditoCentavos)}</dd>
            <dt>Total da alteração</dt>
            <dd className="font-bold sm:text-right">{dinheiro(pedido.totalCentavos)}</dd>
            <dt>Saldo anterior</dt>
            <dd className="font-bold sm:text-right">{dinheiro(pedido.saldoAnteriorCentavos)}</dd>
            <dt>Cobrança agora</dt>
            <dd className="font-bold sm:text-right">{dinheiro(pedido.valorAgoraCentavos)}</dd>
            <dt>Renovação</dt>
            <dd className="font-bold sm:text-right">
              {dinheiro(pedido.valorRenovacaoCentavos)}{" "}
              {pedido.intervalo === "month" ? "por mês" : "por ano"}
            </dd>
            <dt>Vigência prevista</dt>
            <dd className="sm:text-right">
              <time dateTime={pedido.vigencia}>{data(pedido.vigencia)}</time>
            </dd>
          </dl>
          <p className="mt-4 text-sm text-tinta-suave">
            {pedido.tipo === "upgrade"
              ? "A mudança imediata depende da confirmação financeira. Confira acima a situação do acesso."
              : "A redução começa no fim do período atual. A renovação depende da confirmação do pagamento."}
          </p>
          <p className="mt-3 text-sm">
            <strong>Seleção registrada: </strong>
            {pedido.perfis
              .filter((p) => p.cobrir)
              .map(
                (p) =>
                  estado.perfis.find((atual) => atual.perfilId === p.perfilId)?.apelido ??
                  "Perfil indisponível",
              )
              .join(", ") || "Nenhum jogador. O pagante pode administrar sem jogar."}
          </p>
          {pedido.emConferencia && (
            <p role="status" className="mt-4 font-semibold">
              O resultado ainda exige conferência. Consulte o pedido e a gestão de pagamento antes
              de fazer outra troca.
            </p>
          )}
          {andamento && !pedido.aceitoEm && !vencida && estado.modo === "sandbox" && (
            <form
              aria-label="Autorizar troca de plano"
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (aceito) agir("aceitar");
              }}
            >
              <p className="text-sm">
                Aceite até <time dateTime={pedido.aceitarAte}>{data(pedido.aceitarAte)}</time>.
                Registrar a autorização ainda não envia a troca.
              </p>
              <label className="mt-4 flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0"
                  checked={aceito}
                  disabled={bloqueado}
                  required
                  onChange={(e) => aceitar(e.target.checked)}
                />
                <span>
                  Conferi os valores, a vigência e os jogadores e autorizo a troca e a cobrança
                  recorrente nas condições apresentadas.
                </span>
              </label>
              <button type="submit" className="rb rb-sol mt-4" disabled={bloqueado || !aceito}>
                Registrar autorização da troca
              </button>
            </form>
          )}
          {vencida && andamento && (
            <p className="mt-4 font-semibold">
              A cotação venceu. Encerre este pedido e confira as condições novamente.
            </p>
          )}
          {andamento && (
            <div className="mt-5 flex flex-wrap gap-3">
              {!pedido.tentativaEm && (
                <button
                  type="button"
                  className="rb rb-vazado"
                  disabled={bloqueado}
                  onClick={() => agir("encerrar")}
                >
                  Encerrar pedido sem envio
                </button>
              )}
              {pedido.aceitoEm && !pedido.tentativaEm && estado.modo === "sandbox" && (
                <button
                  type="button"
                  className="rb rb-sol"
                  disabled={bloqueado}
                  onClick={() => agir("enviar")}
                >
                  {pedido.tipo === "upgrade" ? "Enviar aumento agora" : "Agendar redução"}
                </button>
              )}
              {pedido.tentativaEm && estado.conferenciaDisponivel && (
                <button
                  type="button"
                  className="rb rb-vazado"
                  disabled={bloqueado}
                  onClick={() => agir("conferir")}
                >
                  Conferir troca enviada
                </button>
              )}
              {pedido.tentativaEm &&
                pedido.tipo === "downgrade" &&
                !pedido.cancelamentoPedidoEm &&
                estado.conferenciaDisponivel && (
                  <button
                    type="button"
                    className="rb rb-vazado"
                    disabled={bloqueado}
                    onClick={() => agir("cancelar")}
                  >
                    Cancelar redução agendada
                  </button>
                )}
            </div>
          )}
        </section>
      )}
      {preparar && (
        <form
          aria-label="Preparar troca de plano"
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            agir("cotar");
          }}
        >
          <fieldset disabled={bloqueado} className="grid gap-3">
            <legend className="mb-3 font-bold">Escolha a nova oferta</legend>
            {estado.ofertas
              .filter((o) => o.productId !== contrato?.produtoId)
              .map((o) => (
                <label
                  key={o.productId}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-current/20 p-4"
                >
                  <input
                    type="radio"
                    name="oferta-troca"
                    required
                    className="mt-1 size-5 shrink-0"
                    value={o.productId}
                    checked={destino === o.productId}
                    onChange={() => escolher(o.productId)}
                  />
                  <span>
                    <strong className="block">{o.nome}</strong>
                    <span className="mt-1 block">
                      {dinheiro(o.amountCents)} {o.interval === "month" ? "por mês" : "por ano"}
                    </span>
                    <span className="mt-1 block text-sm text-tinta-suave">
                      Até {o.perfis} {o.perfis === 1 ? "jogador" : "jogadores"}.
                    </span>
                  </span>
                </label>
              ))}
          </fieldset>
          <fieldset disabled={bloqueado} className="mt-5 grid gap-3">
            <legend className="mb-3 font-bold">Quem continua coberto</legend>
            <p className="text-sm text-tinta-suave">
              A troca conserva ou reduz a seleção atual. Depois de confirmado um plano maior, você
              pode incluir outros jogadores na gestão do grupo.
            </p>
            {estado.perfis.length === 0 && (
              <p>Nenhum perfil de jogador. Você pode continuar como pagante.</p>
            )}
            {estado.perfis.map((p) => (
              <label
                key={p.perfilId}
                className="flex min-h-11 items-start gap-3 rounded-2xl border border-current/20 p-4"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0"
                  disabled={!p.ativo || !p.selecionado}
                  checked={perfis.some((s) => s.perfilId === p.perfilId && s.cobrir)}
                  onChange={(e) => {
                    const cobrir = e.target.checked;
                    selecionar((atuais) =>
                      atuais.map((s) => (s.perfilId === p.perfilId ? { ...s, cobrir } : s)),
                    );
                  }}
                />
                <span className="min-w-0 break-words">
                  {p.apelido}
                  {!p.selecionado && (
                    <span className="block text-sm text-tinta-suave">Fora da seleção atual.</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          {excede && (
            <p role="alert" className="mt-4 font-semibold text-erro">
              Escolha até {oferta?.perfis} {oferta?.perfis === 1 ? "jogador" : "jogadores"} para
              esta oferta.
            </p>
          )}
          <button
            type="submit"
            className="rb rb-sol mt-5"
            disabled={bloqueado || !oferta || excede}
          >
            {pendente ? "Conferindo…" : "Conferir condições da troca"}
          </button>
        </form>
      )}
      {erro && (
        <p role="alert" className="mt-5 font-semibold text-erro">
          {erro}
        </p>
      )}
      {incerta && (
        <a href="/conta/assinatura" className="rb rb-vazado mt-4">
          Recarregar pedido antes de continuar
        </a>
      )}
      {recente && (
        <Link href="/entrar?recente=1&next=%2Fconta%2Fassinatura" className="rb rb-vazado mt-4">
          Entrar novamente
        </Link>
      )}
    </section>
  );
}
