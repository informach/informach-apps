import styles from "../sales.module.css";

/** Sete perguntas, as que as famílias fazem de verdade antes de começar. */
const QUESTIONS = [
  [
    "A escola precisa usar a Agenda?",
    "Não. Você organiza os recados que já recebe, do jeito que eles chegam. A escola continua usando o canal de sempre.",
  ],
  [
    "A Agenda entra sozinha no grupo ou no aplicativo da escola?",
    "Não. Quem manda o recado é você, compartilhando a mensagem, tirando foto ou colando o texto. A Agenda não tem acesso ao seu WhatsApp, ao Teams nem ao Batista ID.",
  ],
  [
    "E se o recado não disser a data?",
    "Se a matéria estiver no horário da turma, a Agenda sugere a próxima aula e avisa que fez a conta. Sem isso, fica a confirmar. Ela nunca inventa uma data que a escola não deu.",
  ],
  [
    "Marcar como feito avisa a escola?",
    "Não. Feito vale só para a sua casa. Entregas e autorizações continuam pelo canal da escola.",
  ],
  [
    "Quem vê os recados e as fotos?",
    "Você e o adulto que você convidar, só das crianças que você escolher. Para ler o recado, o conteúdo que você mandou passa por um serviço de inteligência artificial. O arquivo original fica 30 dias e depois sai; as atividades continuam.",
  ],
  [
    "Funciona sem internet?",
    "Dá para ver o que já estava aberto e marcar como feito, e isso sobe sozinho quando a rede voltar. Para mandar um recado novo, precisa de conexão.",
  ],
  [
    "Posso cancelar quando quiser?",
    "Pode. A renovação para, e o que já está na Agenda continua lá para consultar.",
  ],
] as const;

export function Faq() {
  return (
    <section
      id="perguntas"
      aria-labelledby="faq-title"
      className={[
        styles.wrap,
        "grid scroll-mt-6 gap-8 py-16 md:py-24 lg:grid-cols-[0.8fr_1.2fr]",
      ].join(" ")}
    >
      <div className="space-y-3">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
          Perguntas
        </p>
        <h2
          id="faq-title"
          className="text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[36px]"
        >
          O que as famílias perguntam antes de começar.
        </h2>
      </div>
      <div className={styles.faq}>
        {QUESTIONS.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p className="pb-4 text-[16px] leading-relaxed text-foreground/80">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
