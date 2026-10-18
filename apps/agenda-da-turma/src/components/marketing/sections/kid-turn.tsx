import { cn } from "@informach/ui/lib/utils";
import { DOT, EYEBROW, GRID2, H2, LEAD, Phone, SEC, WRAP } from "../landing-ui";

/** A vez da criança, como na prancha: o celular com uma atividade e o "Feito!", e o porquê ao lado. */
export function KidTurn() {
  return (
    <section id="crianca" aria-labelledby="kid-title" className={SEC}>
      <div className={`${WRAP} ${GRID2}`}>
        <div className="flex justify-center">
          <Phone
            className="h-[560px] w-[280px]"
            scale={0.672}
            screenClassName="box-border flex flex-col gap-5 px-5 py-6"
            label="A vez da criança, com uma atividade e o botão Feito"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-[52px] items-center justify-center rounded-full border-2 border-chart-4/50 bg-chart-4/25 text-xl font-extrabold">
                C
              </span>
              <div>
                <b className="text-2xl">Oi, Clara!</b>
                <div className="text-base text-muted-foreground">1 de 3 feitas</div>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[28px] border border-foreground/15 bg-background p-6 text-center">
              <span className="flex items-center gap-2 text-base font-bold">
                <span className={cn(DOT, "size-3 bg-chart-1")} />
                Matemática
              </span>
              <b className="text-[34px] leading-[1.1] tracking-[-0.03em]">
                Páginas 32 e 33 do livro
              </b>
              <span className="text-lg text-foreground/80">É para hoje</span>
            </div>
            <span className="flex min-h-[72px] items-center justify-center rounded-[20px] bg-primary text-[26px] font-extrabold text-primary-foreground shadow-[0_4px_0_0_var(--primary-solid)]">
              Feito!
            </span>
          </Phone>
        </div>
        <div className="flex flex-col gap-[22px]">
          <p className={EYEBROW}>A vez da criança</p>
          <h2 id="kid-title" className={H2}>
            Na hora da lição, passe o celular.
          </h2>
          <p className={LEAD}>
            A criança vê uma atividade por vez e um botão grande de Feito!. Não tem menu, não tem
            cobrança e não tem prazo em vermelho: o que passou vira “é para hoje”.
          </p>
          <p className={LEAD}>
            Também não tem ponto, ranking ou comparação entre irmãos. Para devolver o celular, é só
            segurar o botão de sair.
          </p>
          <p className="text-sm text-muted-foreground">Está no plano grátis.</p>
        </div>
      </div>
    </section>
  );
}
