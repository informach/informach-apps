import styles from "../sales.module.css";
import { SalesCta, TrialNote } from "../sales-cta";
export function FinalCta() {
  return (
    <section className={[styles.wrap, styles.closing].join(" ")} aria-labelledby="closing-title">
      <h2 id="closing-title">O próximo recado já pode chegar a uma rotina mais clara.</h2>
      <p>
        Comece com uma mensagem da escola. Confira as providências e veja como fica mais fácil
        acompanhar.
      </p>
      <SalesCta placement="final" />
      <TrialNote />
    </section>
  );
}
