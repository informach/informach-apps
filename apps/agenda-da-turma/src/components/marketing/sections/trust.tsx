import styles from "../sales.module.css";
export function Trust() {
  return (
    <section
      className={[styles.wrap, styles.section, styles.trust].join(" ")}
      aria-labelledby="trust-title"
    >
      <div className={styles.change}>
        <span className={[styles.pill, styles.blue].join(" ")}>RETIFICAÇÃO CONFERIDA</span>
        <h3>Enviar autorização</h3>
        <div className={styles.changeDates}>
          <del>14/09</del>
          <span className={styles.changeArrow} aria-hidden="true">
            →
          </span>
          <span className="sr-only">alterado para</span>
          <span>16/09</span>
        </div>
        <p>
          Retificação importada e confirmada pela família.
          <br />O histórico preserva a mudança.
        </p>
        <p className={styles.fine}>Exemplo fictício. A entrada do novo recado é feita por você.</p>
      </div>
      <div>
        <p className={styles.eyebrow}>Clareza também é poder conferir</p>
        <h2 id="trust-title">Você sabe de onde veio. E decide o que fica.</h2>
        <p>
          Confira a publicação e os trechos de origem antes de salvar. Mudou o prazo? Importe a
          retificação e confirme a atualização da atividade existente.
        </p>
        <p>
          Quando a escola não informa uma data, o prazo fica a confirmar. Você pode escolher uma
          data de preparação, identificada como planejamento da família.
        </p>
        <p>
          No portão da escola, sem sinal, marcar como feito continua funcionando. A Agenda guarda a
          sua decisão no aparelho, avisa que ela ainda não subiu e envia sozinha quando a rede
          voltar.
        </p>
        <div className={styles.trustPoints}>
          <span>Revisão antes de salvar</span>
          <span>Histórico de mudanças</span>
          <span>Acesso por criança</span>
          <span>Funciona sem rede</span>
        </div>
      </div>
    </section>
  );
}
