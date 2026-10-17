import { ExternalLink, Info, Lock } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Empty, Note, PageHeader, SectionTitle } from "@/components/blocks";
import { ProductMark } from "@/components/product-mark";
import { ToneIcon } from "@/components/status";
import { formatBRL, formatDateTime, formatDay, formatNumber, formatRelative } from "@/lib/format";
import { PRODUCTS } from "@/lib/products";
import type { CreditFlow, MoneyView } from "../service";
import { statusCount } from "../service";

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-line-warm bg-surface p-4">
      <strong className="tabular font-mono text-[26px] leading-tight font-semibold">{value}</strong>
      <span className="text-[13px] text-ink-muted">{label}</span>
    </div>
  );
}

function StripeLink({
  href,
  children = "Abrir no Stripe",
}: {
  href: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-bold text-ink"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-4" />
      <span className="sr-only">(abre o Stripe)</span>
    </a>
  );
}

/** Pares do cartão de créditos. Compensação e reembolso só aparecem quando aconteceram. */
function creditPairs(flow: CreditFlow): [number, string][] {
  const pairs: [number, string][] = [
    [flow.granted, "créditos concedidos"],
    [flow.consumed, "créditos usados"],
    [
      flow.returnedOnFailure,
      `devolvidos por falha, em ${formatNumber(flow.failedTasks)} ${flow.failedTasks === 1 ? "tarefa" : "tarefas"}`,
    ],
    [flow.reachedExpiry, "chegaram ao vencimento, pelo valor concedido"],
  ];
  if (flow.compensated !== 0) pairs.push([flow.compensated, "dados como compensação"]);
  if (flow.refunded > 0) pairs.push([flow.refunded, "retirados por reembolso"]);
  return pairs;
}

function cell(value: number) {
  return <td className="tabular px-3 py-2.5 text-right font-mono">{formatNumber(value)}</td>;
}

export function MoneyPage({ view }: { view: MoneyView }) {
  const { totals } = view;
  return (
    <>
      <PageHeader
        title="Dinheiro"
        description="Assinaturas, atrasos, avisos do Stripe e créditos de IA. Visível só para contas owner."
      >
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-sand px-3 text-[13px] font-bold text-ink-soft">
          <Lock aria-hidden="true" className="size-3.5" />
          Só owner
        </span>
      </PageHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Kpi
          value={formatBRL(totals.mrrCents)}
          label="receita recorrente por mês, anuais divididos por 12"
        />
        <Kpi value={formatNumber(totals.active)} label="assinaturas ativas pagas" />
        <Kpi value={formatNumber(totals.pastDue)} label="pagamentos em atraso" />
        <Kpi value={formatNumber(totals.scheduled)} label="cancelamentos agendados" />
        {totals.switching > 0 ? (
          <Kpi value={formatNumber(totals.switching)} label="trocas de plano no fim do período" />
        ) : null}
        <Kpi
          value={formatBRL(totals.packCents, { exact: true })}
          label={`${formatNumber(totals.packs)} ${totals.packs === 1 ? "pacote" : "pacotes"} de crédito em 30 dias`}
        />
      </div>
      <Note>
        A receita é uma estimativa pelo preço de tabela do catálogo, só das assinaturas ativas. O
        valor cobrado de verdade, com cupom ou troca de plano no meio do ciclo, está no Stripe.
        {totals.unpriced > 0
          ? ` ${formatNumber(totals.unpriced)} ${totals.unpriced === 1 ? "assinatura ativa não tem" : "assinaturas ativas não têm"} preço no catálogo e ficaram fora da soma.`
          : ""}
      </Note>

      <section aria-labelledby="por-produto" className="grid gap-3">
        <SectionTitle id="por-produto" aside="assinaturas de agora; movimento dos últimos 30 dias">
          Por produto
        </SectionTitle>
        {/* No celular a tabela rola dentro da própria caixa; a página não ganha rolagem lateral. */}
        <div className="overflow-x-auto rounded-[18px] border border-line-warm bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-[15px]">
            <caption className="sr-only">Assinaturas por produto</caption>
            <thead>
              <tr className="text-left text-[13px] text-ink-muted">
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Produto
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  Mensal
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  Anual
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  Em teste
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  Em atraso
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  Novas em 30 dias
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  Canceladas em 30 dias
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  Por mês
                </th>
              </tr>
            </thead>
            <tbody>
              {view.products.map((row) => (
                <tr key={row.product} className="border-t border-line-soft align-top">
                  <th scope="row" className="px-3 py-2.5 text-left font-semibold">
                    <span className="flex items-center gap-2">
                      <ProductMark product={row.product} size={20} />
                      {PRODUCTS[row.product].name}
                    </span>
                    {row.scheduledPhrases.length > 0 ||
                    row.switched30 > 0 ||
                    row.others.length > 0 ? (
                      <span className="mt-1 block text-[13px] font-normal text-ink-muted">
                        {[
                          ...row.scheduledPhrases,
                          row.switched30 > 0
                            ? `${formatNumber(row.switched30)} ${row.switched30 === 1 ? "trocou" : "trocaram"} de plano em 30 dias`
                            : null,
                          ...row.others.map((other) => statusCount(other.total, other.status)),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </th>
                  {row.hasAny ? (
                    <>
                      {cell(row.monthly)}
                      {cell(row.annual)}
                      {cell(row.trialing)}
                      {cell(row.pastDue)}
                      {cell(row.started30)}
                      {cell(row.canceled30)}
                      <td className="tabular px-3 py-2.5 text-right font-mono font-semibold">
                        {formatBRL(row.mrrCents)}
                      </td>
                    </>
                  ) : (
                    <td colSpan={7} className="px-3 py-2.5 text-ink-muted">
                      Nenhuma assinatura registrada ainda.
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-labelledby="atrasos"
          className="grid min-w-0 flex-[1_1_420px] content-start gap-3 rounded-[18px] border border-line-warm bg-surface p-5"
        >
          <SectionTitle id="atrasos" aside="o Stripe faz as novas tentativas">
            Pagamentos em atraso
          </SectionTitle>
          {view.pastDue.length === 0 ? (
            <Empty>Nenhum pagamento em atraso agora.</Empty>
          ) : (
            <ul className="m-0 grid list-none gap-1 p-0">
              {view.pastDue.map((item) => (
                <li
                  key={`${item.userId}-${item.stripeUrl}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line-soft py-2.5 first:border-t-0"
                >
                  <span className="grid min-w-0 gap-0.5">
                    <Link href={`/pessoas/${item.userId}` as Route} className="font-bold text-ink">
                      {item.name || "Pessoa sem nome"}
                    </Link>
                    <span className="text-sm text-ink-soft">
                      {item.plan} · renovação de {formatDay(item.periodStart)} não foi paga
                      {item.amountCents !== null
                        ? ` · ${formatBRL(item.amountCents, { exact: true })}`
                        : ""}
                    </span>
                  </span>
                  <StripeLink href={item.stripeUrl} />
                </li>
              ))}
            </ul>
          )}
          <Note>
            Em atraso não conta como Pro: a pessoa fica sem o plano pago até o pagamento passar.
          </Note>
        </section>

        <section
          aria-labelledby="stripe"
          className="grid min-w-0 flex-[1_1_360px] content-start gap-3 rounded-[18px] border border-line-warm bg-surface p-5"
        >
          <SectionTitle id="stripe" aside="últimos 30 dias">
            Avisos do Stripe
          </SectionTitle>
          {view.webhooks.length === 0 ? (
            <Empty>Nenhum aviso do Stripe ficou para trás.</Empty>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {view.webhooks.map((item) => (
                <li key={item.id} className="grid gap-1.5 rounded-[14px] bg-warn-row p-3.5">
                  <span className="flex items-center gap-2 font-bold">
                    <ToneIcon tone={item.needsResend ? "bad" : "warn"} className="size-4" />
                    {item.attempts >= 2 ? `Falhou ${item.attempts} vezes` : "Não foi processado"},{" "}
                    {formatRelative(item.createdAt, view.now)}
                  </span>
                  {item.needsResend ? (
                    <span className="text-sm font-bold text-ink">
                      Precisa reenviar pelo Stripe: passou dos três dias em que ele tenta sozinho.
                    </span>
                  ) : null}
                  <span className="tabular font-mono text-[13px] text-ink-soft">
                    {item.eventType}
                    {item.product ? ` · ${PRODUCTS[item.product].name}` : ""} ·{" "}
                    {formatDateTime(item.createdAt)}
                  </span>
                  <span className="text-sm text-ink-soft">{item.consequence}</span>
                  <StripeLink href={item.stripeUrl}>Ver o evento no Stripe</StripeLink>
                </li>
              ))}
            </ul>
          )}
          {view.webhookTotals.total > view.webhooks.length ? (
            <p className="m-0 text-sm text-ink-soft">
              A lista mostra os {formatNumber(view.webhooks.length)} mais recentes de{" "}
              {formatNumber(view.webhookTotals.total)} sem processamento
              {view.webhookTotals.needsResend > 0
                ? `; ${formatNumber(view.webhookTotals.needsResend)} já ${view.webhookTotals.needsResend === 1 ? "precisa" : "precisam"} de reenvio pelo Stripe`
                : ""}
              .
            </p>
          ) : null}
          <p className="m-0 text-sm text-ink-soft">
            <strong className="tabular font-mono">{formatNumber(view.processed24h)}</strong>{" "}
            {view.processed24h === 1 ? "aviso processado" : "avisos processados"} nas últimas 24
            horas.
          </p>
          <Note>
            O Stripe reenvia sozinho por três dias. Passado esse prazo, o aviso continua aqui até
            ser processado: reenvie pelo próprio evento no Stripe. O processamento é idempotente e
            não cobra nem concede nada duas vezes.
          </Note>
        </section>
      </div>

      <section aria-labelledby="creditos" className="grid gap-3">
        <SectionTitle id="creditos" aside="últimos 30 dias">
          Créditos de IA
        </SectionTitle>
        {view.credits.length === 0 ? (
          <Empty>Nenhum movimento de crédito nos últimos 30 dias.</Empty>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 p-0">
            {view.credits.map((flow) => (
              <li
                key={flow.product}
                className="grid gap-3 rounded-2xl border border-line-warm bg-surface p-4"
              >
                <span className="flex items-center gap-2 font-bold">
                  <ProductMark product={flow.product} size={22} />
                  {PRODUCTS[flow.product].name}
                </span>
                <dl className="m-0 grid grid-cols-2 gap-3">
                  {creditPairs(flow).map(([value, label]) => (
                    <div key={label} className="grid">
                      <dt className="order-2 text-[13px] text-ink-muted">{label}</dt>
                      <dd className="tabular order-1 m-0 font-mono text-xl font-semibold">
                        {formatNumber(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {flow.packs > 0 ? (
                  <span className="text-[13px] text-ink-soft">
                    {formatNumber(flow.packs)}{" "}
                    {flow.packs === 1 ? "pacote vendido" : "pacotes vendidos"},{" "}
                    {formatBRL(flow.packCents, { exact: true })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {view.credits.length > 0 ? (
          <Note>
            Tarefa de IA que falha não cobra: a reserva é solta e o crédito volta para o saldo. O
            vencimento é registrado pelo valor que foi concedido, mesmo que parte já tenha sido
            usada; quanto venceu sem uso de fato não aparece separado aqui.
          </Note>
        ) : null}
        {view.overdueReservations > 0 ? (
          <Note>
            {formatNumber(view.overdueReservations)}{" "}
            {view.overdueReservations === 1 ? "reserva passou" : "reservas passaram"} do prazo sem
            fechar; a rotina de 5 minutos devolve os créditos.
          </Note>
        ) : null}
      </section>

      <p className="m-0 flex items-start gap-2.5 rounded-xl bg-sand px-4 py-3 text-sm text-ink-soft">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Preço, reembolso, cupom e cancelamento continuam no Stripe. Aqui você vê e encontra a
          pessoa; a mudança acontece lá, e o webhook traz o resultado de volta.
        </span>
      </p>
    </>
  );
}
