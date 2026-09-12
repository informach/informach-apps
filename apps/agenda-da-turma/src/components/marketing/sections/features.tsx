import styles from "../sales.module.css";

export function Features() {
  return (
    <section id="familia" className={styles.wrap} aria-labelledby="family-title">
      <div className={styles.family}>
        <div>
          <span className={[styles.pill, styles.pro].join(" ")}>PARA A FAMÍLIA · PRO</span>
          <h2 id="family-title">O próximo dia fica mais claro quando a rotina está combinada.</h2>
          <p className={styles.lead}>
            Abra a rotina. Encontre o próximo passo. Combine quem cuida e acompanhem juntos, cada um
            com seu próprio login.
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
              <strong>Conferir o material de artes</strong>
              <small>Miguel · Preparação da família</small>
            </div>
            <span className={[styles.person, styles.second].join(" ")}>Leo cuida</span>
          </div>
          <div className={styles.reminderPreview}>
            <strong>Escolha quando lembrar. Siga com o seu dia.</strong>No Pro, configure resumo por
            e-mail e lembretes. Push em dispositivo compatível e com sua autorização.
          </div>
        </div>
      </div>
    </section>
  );
}
