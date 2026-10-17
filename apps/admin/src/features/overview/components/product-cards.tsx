import type { Route } from "next";
import Link from "next/link";
import { SectionTitle } from "@/components/blocks";
import { ProductMark } from "@/components/product-mark";
import { PRODUCTS } from "@/lib/products";
import type { ProductCard } from "../service";

/** "Produtos nos últimos 7 dias": um cartão por produto e o aviso do Sistema Zero. */
export function ProductCards({ cards }: { cards: ProductCard[] }) {
  return (
    <section aria-labelledby="produtos" className="grid gap-3">
      <SectionTitle
        id="produtos"
        aside={
          <Link href="/produtos" className="text-sm font-bold text-ink">
            Ver cada produto
          </Link>
        }
      >
        Produtos nos últimos 7 dias
      </SectionTitle>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3 p-0">
        {cards.map((card) => (
          <li key={card.product}>
            <Link
              href={`/produtos?p=${card.product}` as Route}
              className="grid min-h-full content-start gap-3.5 rounded-2xl border border-line-warm bg-surface p-[18px] text-ink no-underline hover:border-ink"
            >
              <span className="flex items-center gap-2.5">
                <ProductMark product={card.product} />
                <strong className="text-[17px]">{PRODUCTS[card.product].name}</strong>
              </span>
              <span className="grid grid-cols-2 gap-3">
                {card.stats.map((stat) => (
                  <span key={stat.label} className="grid">
                    <strong className="tabular font-mono text-[22px] leading-tight font-semibold">
                      {stat.value}
                    </strong>
                    <span className="text-[13px] text-ink-muted">{stat.label}</span>
                  </span>
                ))}
              </span>
              {card.note ? <span className="text-[13px] text-ink-muted">{card.note}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      <p className="m-0 flex items-center gap-2.5 rounded-xl bg-[#EEF2FB] px-4 py-3 text-sm text-[#233F73]">
        <span aria-hidden="true" className="size-[22px] shrink-0 rounded-md bg-[#0062D6]" />O
        Sistema Zero roda em plataforma própria, em sistemazero.com.br, e por enquanto fica fora
        deste painel.
      </p>
    </section>
  );
}
