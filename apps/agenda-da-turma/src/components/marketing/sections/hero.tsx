import { HeroActivityCards } from "../hero-activity-cards";
import styles from "../sales.module.css";
import { SalesCta, TrialNote } from "../sales-cta";

export function Hero() {
  return (
    <>
      <section className={[styles.wrap, styles.hero].join(" ")} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Da escola para a rotina da família</p>
          <h1 id="hero-title">
            A rotina da escola não precisa morar na sua <em>cabeça.</em>
          </h1>
          <p className={styles.description}>
            Transforme mensagens, fotos e PDFs da escola em uma lista clara do que fazer e até
            quando. No Pro, divida os cuidados e acompanhe com lembretes.
          </p>
          <div className={styles.heroActions}>
            <SalesCta placement="hero" />
            <a className={styles.textLink} href="#demonstracao">
              Experimentar a demonstração
            </a>
          </div>
          <TrialNote />
          <p className={styles.heroContext}>
            Copie a publicação do Teams, Batista ID ou outro canal e junte o anexo. Você confere
            antes de salvar.
          </p>
        </div>
        <HeroActivityCards />
      </section>
      <div className={styles.sourceStrip}>
        <div className={styles.wrap}>
          <p>A escola continua no canal de sempre.</p>
          <div className={styles.sourceNames}>
            <span>Microsoft Teams</span>
            <span>Batista ID</span>
            <span>e outros canais</span>
          </div>
          <p>
            Você traz o conteúdo.
            <br />A Agenda ajuda a organizar.
          </p>
        </div>
      </div>
    </>
  );
}
