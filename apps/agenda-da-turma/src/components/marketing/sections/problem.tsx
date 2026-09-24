import styles from "../sales.module.css";

const STEPS = [
  [
    "Uma atividade por matéria",
    "O cartaz com cinco matérias não vira um bloco só. Cada matéria ganha a sua atividade, já vinculada à matéria que a criança tem na turma.",
  ],
  [
    "O prazo no lugar certo",
    "Datas da escola ficam à vista. Sem data no recado, a Agenda sugere a próxima aula daquela matéria, e diz que foi ela quem calculou.",
  ],
  [
    "Quem vai cuidar",
    "No Pro, combine os responsáveis e divida os cuidados com outro adulto, cada um com o seu login.",
  ],
] as const;
export function Problem() {
  return (
    <section
      className={[styles.wrap, styles.section, styles.recognition].join(" ")}
      aria-labelledby="problem-title"
    >
      <div>
        <p className={styles.eyebrow}>Menos lista mental. Mais clareza.</p>
        <h2 id="problem-title">Ler o recado é só o começo.</h2>
        <p>
          Ainda tem a autorização para responder, o material para separar e alguém para combinar
          quem vai cuidar. A Agenda da Turma transforma essa lista mental em próximos passos, na
          ordem em que eles chegam.
        </p>
      </div>
      <div className={styles.proofRows}>
        {STEPS.map(([title, text], index) => (
          <div className={styles.proofRow} key={title}>
            <span className={styles.proofNumber}>0{index + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
