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
            Fotografe o cartaz, compartilhe a mensagem ou cole o texto. A Agenda separa uma
            atividade por matéria, com o prazo de cada uma, e você confere antes de salvar.
          </p>
          <div className={styles.heroActions}>
            <SalesCta placement="hero" />
            <a className={styles.textLink} href="#demonstracao">
              Experimentar a demonstração
            </a>
          </div>
          <TrialNote />
          <p className={styles.heroContext}>
            Um cartaz com cinco matérias e duas datas vira dez atividades, cada uma já ligada à
            matéria da sua criança. Nada é salvo sem a sua revisão.
          </p>
        </div>
        <HeroActivityCards />
      </section>
      <div className={styles.sourceStrip}>
        <div className={styles.wrap}>
          <p>A escola continua no canal de sempre.</p>
          <div className={styles.sourceNames}>
            <span>WhatsApp</span>
            <span>Microsoft Teams</span>
            <span>Batista ID</span>
            <span>Foto da agenda</span>
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
