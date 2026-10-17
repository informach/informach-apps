export function FinalCta() {
  return (
    <section aria-labelledby="final-titulo" className="bg-sphere text-on-sphere">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-7 px-4 py-14 sm:px-6 md:py-[88px] lg:px-10">
        <h2
          id="final-titulo"
          className="max-w-[720px] text-balance text-[32px] font-extrabold leading-[1.02] tracking-[-0.03em] md:text-[56px]"
        >
          Comece pelo que mais aperta hoje.
        </h2>
        <a
          href="#comecar"
          className="inline-flex min-h-14 items-center rounded-full bg-paper px-[26px] text-[17px] font-extrabold text-ink no-underline transition-opacity hover:opacity-90"
        >
          Encontrar o produto certo
        </a>
      </div>
    </section>
  );
}
