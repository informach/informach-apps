import styles from "../sales.module.css";

const STEPS = [
  [
    "O que precisa ser feito",
    "Autorizações, materiais e tarefas viram providências que você pode acompanhar.",
  ],
  [
    "Qual é o prazo",
    "Datas da escola ficam à vista. Quando falta uma data, o prazo fica a confirmar.",
  ],
  [
    "Quem vai cuidar",
    "No Pro, combine os responsáveis e compartilhe os cuidados com outro adulto.",
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
          quem vai cuidar. A Agenda da Turma ajuda a transformar essa lista mental em próximos
          passos.
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
