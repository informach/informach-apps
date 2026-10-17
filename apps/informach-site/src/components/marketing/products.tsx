import type { CSSProperties } from "react";
import { ProductMark } from "@/components/marketing/product-mark";
import { AUDIENCE_LABEL, SITE_PRODUCTS } from "@/lib/products";

/* O Sistema Zero tem seção própria logo acima; aqui ficam os outros quatro. */
const OTHERS = SITE_PRODUCTS.filter((product) => product.slug !== "sistema-zero");

export function Products() {
  return (
    <section
      id="produtos"
      aria-labelledby="produtos-titulo"
      className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 md:py-28 lg:px-10"
    >
      <div className="grid max-w-[760px] gap-3.5">
        <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-sphere-ink">
          Os outros produtos da casa
        </p>
        <h2
          id="produtos-titulo"
          className="text-balance text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink md:text-[52px]"
        >
          Cada um cuida de um pedaço da rotina.
        </h2>
        <p className="text-lg text-ink-soft">
          Todos usam a mesma conta Informach. Você assina só o que fizer sentido para a sua casa.
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-4">
        {OTHERS.map((product) => (
          <article
            key={product.slug}
            id={product.slug}
            aria-labelledby={`${product.slug}-nome`}
            className="flex flex-col overflow-hidden rounded-[26px] border border-line-warm bg-surface"
          >
            <div
              className="grid gap-3.5 p-6"
              style={{ background: product.brand.background, color: product.brand.foreground }}
            >
              <ProductMark product={product} size={56} />
              <p className="text-[13px] font-extrabold uppercase tracking-[0.06em]">
                {AUDIENCE_LABEL[product.audience]}
              </p>
            </div>
            <div className="grid flex-1 content-start gap-3 p-6 text-ink">
              <h3
                id={`${product.slug}-nome`}
                className="text-[26px] font-extrabold tracking-[-0.02em]"
              >
                {product.name}
              </h3>
              <p className="font-bold">{product.promise}</p>
              <ul className="grid list-disc gap-1.5 pl-[18px] text-[15px] text-ink-soft">
                {product.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              <p className="mt-auto pt-3 text-sm text-ink-muted">{product.price}</p>
              <a
                href={product.cta.href}
                style={{ "--brand-link": product.brand.link } as CSSProperties}
                className="inline-flex min-h-11 items-center justify-self-start font-extrabold text-[var(--brand-link)] underline decoration-2 decoration-transparent underline-offset-4 transition-colors hover:decoration-current dark:text-ink"
              >
                <span>
                  {product.cta.label} <span aria-hidden>→</span>
                </span>
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
