import styles from "../sales.module.css";
import { SalesCta, TrialNote } from "../sales-cta";

export function FinalCta() {
  return (
    <section
      aria-labelledby="closing-title"
      className={[styles.wrap, "space-y-5 py-16 text-center md:py-24"].join(" ")}
    >
      <h2
        id="closing-title"
        className="mx-auto max-w-[40rem] text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
      >
        Qual recado está na sua cabeça agora? Comece por ele.
      </h2>
      <div className="flex justify-center">
        <SalesCta placement="final" label="Organizar esse recado" />
      </div>
      <TrialNote />
    </section>
  );
}
