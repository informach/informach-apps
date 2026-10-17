import { ExternalLink, Info } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Empty, PageHeader, SectionTitle } from "@/components/blocks";
import { ProductMark } from "@/components/product-mark";
import { StatusPill, type Tone } from "@/components/status";
import { formatPercent } from "@/lib/format";
import { isProductKey } from "@/lib/products";
import { PRODUCT_TABS, type ProductTab, TAB_LABEL } from "../logic";
import type { ProductView } from "../service";

const STATE: Record<"up" | "slow" | "down", { tone: Tone; label: string }> = {
  up: { tone: "ok", label: "No ar" },
  slow: { tone: "warn", label: "Lento" },
  down: { tone: "bad", label: "Fora do ar" },
};

/** Marca de aba que não é produto com conta: o site leva o laranja da casa, o Sistema Zero o azul dele. */
function TabMark({ tab }: { tab: ProductTab }) {
  if (isProductKey(tab)) return <ProductMark product={tab} size={52} />;
  return (
    <span
      aria-hidden="true"
      className="size-[52px] shrink-0 rounded-[15px]"
      style={{ background: tab === "site" ? "#C65A24" : "#0062D6" }}
    />
  );
}

function Tabs({ current }: { current: ProductTab }) {
  return (
    <nav aria-label="Escolha o produto">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {PRODUCT_TABS.map((tab) => (
          <li key={tab}>
            <Link
              href={`/produtos?p=${tab}` as Route}
              aria-current={tab === current ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 font-bold no-underline ${
                tab === current
                  ? "border-night bg-night text-white"
                  : "border-field bg-surface text-ink hover:border-ink"
              }`}
            >
              {TAB_LABEL[tab]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PairList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <ul className="m-0 grid list-none p-0">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-baseline justify-between gap-4 border-t border-line-soft py-2.5 first:border-t-0"
        >
          <span className="text-ink-soft">{item.label}</span>
          <strong className="tabular text-right font-mono font-semibold">{item.value}</strong>
        </li>
      ))}
    </ul>
  );
}

export function ProductPage({ view }: { view: ProductView }) {
  const state = view.service ? STATE[view.service.state] : null;
  return (
    <>
      <PageHeader
        title="Produtos"
        description="Cada app com os números que ele de fato registra. Últimos 7 dias, salvo indicação."
      />
      <Tabs current={view.tab} />

      <section
        aria-labelledby="produto-nome"
        className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-line-warm bg-surface p-5"
      >
        <div className="flex min-w-0 items-center gap-4">
          <TabMark tab={view.tab} />
          <div className="grid min-w-0">
            <h2 id="produto-nome" className="m-0 text-2xl font-extrabold tracking-[-0.02em]">
              {view.name}
            </h2>
            <span className="tabular truncate font-mono text-[13px] text-ink-muted">
              {view.domain}
            </span>
          </div>
        </div>
        <div className="grid justify-items-start gap-1 sm:justify-items-end">
          {state ? (
            <StatusPill tone={state.tone}>{state.label}</StatusPill>
          ) : (
            <StatusPill tone="info">Fora deste painel</StatusPill>
          )}
          <span className="text-[13px] text-ink-muted">
            {view.service?.line ?? "plataforma própria, fora do monorepo"}
          </span>
        </div>
      </section>

      {view.kpis.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3 p-0">
          {view.kpis.map((kpi) => (
            <li
              key={kpi.label}
              className="grid gap-1 rounded-2xl border border-line-warm bg-surface p-4"
            >
              <strong className="tabular font-mono text-[26px] leading-tight font-semibold">
                {kpi.value}
              </strong>
              <span className="text-[13px] text-ink-muted">{kpi.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-start gap-5">
        {view.funnel.length > 0 ? (
          <section
            aria-labelledby="funil"
            className="grid min-w-0 flex-[1_1_380px] content-start gap-3 rounded-[18px] border border-line-warm bg-surface p-5"
          >
            <SectionTitle id="funil" aside="contas desde o lançamento">
              Do cadastro à assinatura
            </SectionTitle>
            <ol className="m-0 grid list-none gap-3 p-0">
              {view.funnel.map((step) => (
                <li key={step.label} className="grid gap-1.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span>{step.label}</span>
                    <span className="tabular font-mono font-semibold">
                      {step.value.toLocaleString("pt-BR")}
                      {step.share ? (
                        <span className="ml-2 text-[13px] font-normal text-ink-muted">
                          {formatPercent(step.share.value)} {step.share.text}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span aria-hidden="true" className="block h-2.5 rounded-full bg-sand">
                    <span
                      className="block h-full rounded-full bg-sphere-strong"
                      style={{ width: `${step.width}%` }}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section
          aria-labelledby="uso"
          className="grid min-w-0 flex-[1_1_320px] content-start gap-2 rounded-[18px] border border-line-warm bg-surface p-5"
        >
          <h2 id="uso" className="m-0 text-lg font-extrabold">
            {view.usageTitle}
          </h2>
          <PairList items={view.usage} />
        </section>
      </div>

      {view.plans.length > 0 || view.credits.length > 0 ? (
        <div className="flex flex-wrap items-start gap-5">
          {view.plans.length > 0 ? (
            <section
              aria-labelledby="planos"
              className="grid min-w-0 flex-[1_1_320px] content-start gap-2 rounded-[18px] border border-line-warm bg-surface p-5"
            >
              <h2 id="planos" className="m-0 text-lg font-extrabold">
                Planos agora
              </h2>
              <PairList items={view.plans} />
            </section>
          ) : null}
          <section
            aria-labelledby="creditos-produto"
            className="grid min-w-0 flex-[1_1_320px] content-start gap-2 rounded-[18px] border border-line-warm bg-surface p-5"
          >
            <h2 id="creditos-produto" className="m-0 text-lg font-extrabold">
              Créditos de IA nos últimos 30 dias
            </h2>
            {view.credits.length > 0 ? (
              <PairList items={view.credits} />
            ) : (
              <Empty>Nenhum movimento de crédito nos últimos 30 dias.</Empty>
            )}
          </section>
        </div>
      ) : null}

      <section
        aria-labelledby="ia-produto"
        className="grid gap-2 rounded-[18px] border border-line-warm bg-surface p-5"
      >
        <h2 id="ia-produto" className="m-0 text-lg font-extrabold">
          Inteligência artificial
        </h2>
        <p className="m-0 text-ink-soft">{view.ai}</p>
      </section>

      <p className="m-0 flex items-start gap-2.5 rounded-xl bg-sand px-4 py-3 text-sm text-ink-soft">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{view.note}</span>
      </p>

      <nav aria-label={`Links de ${view.name}`}>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
          {view.links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 font-bold text-ink"
              >
                {link.label}
                <ExternalLink aria-hidden="true" className="size-4" />
                <span className="sr-only">(abre fora do Bastidores)</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
