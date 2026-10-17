import styles from "../sales.module.css";

/** A vez da criança: estava escondida na pergunta 9 do FAQ. */
export function KidTurn() {
  return (
    <section
      id="crianca"
      aria-labelledby="kid-title"
      className={[
        styles.wrap,
        "grid scroll-mt-6 gap-10 py-16 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:items-center",
      ].join(" ")}
    >
      <figure
        aria-label="A vez da criança no celular, com dados de exemplo"
        className="mx-auto w-full max-w-[300px] space-y-4 rounded-[28px] border-[6px] border-foreground bg-background p-5 text-center"
      >
        <p className="text-[22px] font-extrabold">Oi, Clara!</p>
        <p className="text-sm font-semibold text-muted-foreground">1 de 3 feitas</p>
        <div className="space-y-1 rounded-2xl border border-foreground/15 p-4 text-left">
          <p className="text-[13px] font-bold text-muted-foreground">Matemática</p>
          <p className="text-[18px] font-extrabold leading-snug">Páginas 32 e 33 do livro</p>
          <p className="text-sm font-semibold">É para hoje</p>
        </div>
        <p className="flex min-h-14 items-center justify-center rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground">
          Feito!
        </p>
      </figure>
      <div className="space-y-4">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
          A vez da criança
        </p>
        <h2
          id="kid-title"
          className="text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
        >
          Na hora da lição, passe o celular.
        </h2>
        <p className="text-[16px] leading-relaxed text-foreground/80">
          A criança vê uma atividade por vez e um botão grande de Feito!. Não tem menu, não tem
          cobrança e não tem prazo em vermelho: o que passou vira “é para hoje”.
        </p>
        <p className="text-[16px] leading-relaxed text-foreground/80">
          Também não tem ponto, ranking ou comparação entre irmãos. Para devolver o celular, é só
          segurar o botão de sair.
        </p>
        <p className="text-sm font-semibold text-muted-foreground">Está no plano grátis.</p>
      </div>
    </section>
  );
}
