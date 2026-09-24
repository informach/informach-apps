import styles from "../sales.module.css";

export function Features() {
  return (
    <section id="familia" className={styles.wrap} aria-labelledby="family-title">
      <div className={styles.family}>
        <div>
          <span className={[styles.pill, styles.pro].join(" ")}>PARA A FAMÍLIA · PRO</span>
          <h2 id="family-title">A semana fica mais leve quando alguém avisa antes.</h2>
          <p className={styles.lead}>
            Abra a rotina uma vez por dia. A Agenda mostra o próximo passo, avisa qual dia da semana
            está pesado e ajuda a dividir quem cuida do quê.
          </p>
          <p className={styles.familyNote}>
            Com a prova marcada, você pede um plano de estudo e a Agenda reparte as sessões pelos
            dias mais livres até a véspera. No domingo chega o resumo do que vem pela frente,
            enquanto ainda dá para organizar a semana.
          </p>
          <p className={styles.familyNote}>
            Uma assinatura para até três crianças e dois adultos, com acesso definido por criança.
            Também faz sentido para quem cuida sozinho: convidar alguém é opcional.
          </p>
        </div>
        <div className={styles.familyProof}>
          <div className={styles.familyProofHead}>
            <h3>Preparar para amanhã</h3>
            <div className={styles.avatarPair}>
              <span className={styles.miniAvatar}>AN</span>
              <span className={styles.miniAvatar}>LE</span>
            </div>
          </div>
          <p className={styles.caption}>Exemplo fictício · Rotina de 17 de setembro</p>
          <div className={styles.assignment}>
            <div>
              <strong>Separar boné e garrafa</strong>
              <small>Clara · Passeio ao museu</small>
            </div>
            <span className={styles.person}>Ana cuida</span>
          </div>
          <div className={styles.assignment}>
            <div>
              <strong>Levar tênis e garrafa</strong>
              <small>Miguel · Educação Física tem aula amanhã</small>
            </div>
            <span className={[styles.person, styles.second].join(" ")}>Leo cuida</span>
          </div>
          <div className={styles.reminderPreview}>
            <strong>Terça está cheia: 3 entregas.</strong>O aviso chega na sexta, enquanto ainda dá
            para adiantar no fim de semana. No Pro, configure também resumo por e-mail e lembretes.
            Push em dispositivo compatível e com sua autorização.
          </div>
        </div>
      </div>
    </section>
  );
}
