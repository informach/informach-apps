import Image from "next/image";
import { ProductMark } from "@/components/marketing/product-mark";
import { productBySlug, type SiteProduct } from "@/lib/products";

/* Posições na órbita, em porcentagem do quadrado: um produto a cada 72 graus. */
const ORBIT: readonly { slug: SiteProduct["slug"]; left: string; top: string }[] = [
  { slug: "sistema-zero", left: "50%", top: "11.5%" },
  { slug: "missao-saber", left: "86.6%", top: "38.1%" },
  { slug: "agenda-da-turma", left: "72.6%", top: "81.1%" },
  { slug: "cozya", left: "27.4%", top: "81.1%" },
  { slug: "edi", left: "13.4%", top: "38.1%" },
];

export function Hero() {
  return (
    <section
      aria-labelledby="titulo"
      className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-12 px-4 pt-12 pb-12 sm:px-6 md:pt-20 md:pb-20 lg:px-10"
    >
      <div className="grid min-w-0 flex-[1_1_480px] justify-items-start gap-6">
        <p className="inline-flex items-center gap-2.5 text-[13px] font-bold uppercase tracking-[0.08em] text-sphere-ink">
          <span aria-hidden className="size-2.5 rounded-full bg-sphere" />
          Informach · Núcleo de Aprendizagem
        </p>
        <h1
          id="titulo"
          className="text-balance text-[44px] font-extrabold leading-none tracking-[-0.035em] text-ink sm:text-6xl lg:text-[80px]"
        >
          Feito em casa, para a <span className="text-sphere">sua família</span>.
        </h1>
        <p className="max-w-[600px] text-lg leading-relaxed text-ink-soft md:text-xl">
          Fazemos tecnologia para o que acontece em casa: a criança que aprende, a rotina da escola,
          o jantar da semana e as aulas de quem ensina.
        </p>
        <div className="flex items-center gap-3.5 rounded-full border border-line-warm bg-surface py-2 pr-5 pl-2">
          <Image
            src="/sistema-zero/helena-julio.webp"
            alt="Helena e Júlio"
            width={48}
            height={48}
            className="size-12 rounded-full object-cover"
          />
          <span className="text-[15px] leading-snug text-ink">
            <strong>Somos Helena e Júlio</strong>
            <span className="block text-ink-muted">desenvolvedores e pais do André</span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          <a
            href="#comecar"
            className="inline-flex min-h-[54px] items-center rounded-full bg-sphere px-6 text-base font-extrabold text-on-sphere no-underline transition-colors hover:brightness-95"
          >
            Encontrar o produto certo
          </a>
          <a
            href="#sistema-zero"
            className="inline-flex min-h-[54px] items-center rounded-full border-2 border-ink px-6 text-base font-bold text-ink no-underline transition-colors hover:bg-sand"
          >
            Sistema Zero para crianças
          </a>
        </div>
      </div>

      <div className="grid min-w-0 flex-[1_1_440px] place-items-center">
        <div
          role="img"
          aria-label="A esfera da Informach no centro, com os cinco produtos ao redor: Sistema Zero, Missão Saber, Agenda da Turma, Cozya e Suíte Edi."
          className="relative aspect-square w-full max-w-[520px]"
        >
          <span className="absolute inset-[11.5%] rounded-full border-2 border-dashed border-orbit" />
          <span className="absolute inset-[27%] rounded-full border border-line-warm bg-surface" />
          <Image
            src="/icon.png"
            alt=""
            width={512}
            height={512}
            priority
            className="absolute top-1/2 left-1/2 size-[26%] -translate-x-1/2 -translate-y-1/2"
          />
          {ORBIT.map((point) => {
            const product = productBySlug(point.slug);
            return (
              <span
                key={point.slug}
                className="absolute grid -translate-x-1/2 -translate-y-1/2 justify-items-center gap-1.5"
                style={{ left: point.left, top: point.top }}
              >
                <ProductMark
                  product={product}
                  size={64}
                  className="shadow-[0_10px_24px_rgb(23_50_71/0.18)]"
                />
                <span className="whitespace-nowrap rounded-full bg-surface px-2.5 py-0.5 text-[13px] font-extrabold text-ink">
                  {product.name}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
