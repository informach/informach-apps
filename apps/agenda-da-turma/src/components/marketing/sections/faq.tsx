import { cn } from "@informach/ui/lib/utils";
import { EYEBROW, GRID2, H2, SEC, WRAP } from "../landing-ui";
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

/** As perguntas da prancha: a primeira já aberta, as outras a um toque. */
export function Faq() {
  return (
    <section id="perguntas" aria-labelledby="faq-title" className={SEC}>
      <div className={cn(WRAP, GRID2, "items-start")}>
        <div className="flex flex-col gap-4">
          <p className={EYEBROW}>Perguntas</p>
          <h2 id="faq-title" className={H2}>
            O que as famílias perguntam antes de começar.
          </h2>
        </div>
        <div className={styles.faq}>
          {QUESTIONS.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary>{question}</summary>
              <p className="mb-[22px] max-w-[640px] text-[17px] leading-[1.6] text-foreground/80">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
