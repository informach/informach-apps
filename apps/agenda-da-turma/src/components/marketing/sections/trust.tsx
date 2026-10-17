import styles from "../sales.module.css";

const POINTS = [
  {
    title: "A escola disse",
    text: "A data está no recado, e o trecho fica guardado junto da atividade.",
  },
  {
    title: "Na próxima aula",
    text: "Sem data no recado, a Agenda olha o horário da turma e avisa que fez a conta.",
  },
  {
    title: "A confirmar",
    text: "Sem data e sem horário, fica a confirmar. Nada de “amanhã” chutado.",
  },
  {
    title: "Sem sinal no portão",
    text: "Marcar como feito funciona sem internet e sobe sozinho quando a rede volta.",
  },
];

export function Trust() {
  return (
    <section
      id="confianca"
      aria-labelledby="trust-title"
      className="scroll-mt-6 border-y border-foreground/15 bg-muted/40 py-16 md:py-24"
    >
      <div className={[styles.wrap, "space-y-8"].join(" ")}>
        <div className="space-y-3">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
            Por que dá para confiar
          </p>
          <h2
            id="trust-title"
            className="max-w-[44rem] text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
          >
            Nenhuma data entra na sua semana sem você ver de onde ela saiu.
          </h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((point) => (
            <li
              key={point.title}
              className="space-y-2 rounded-[20px] border border-foreground/15 bg-background p-5"
            >
              <h3 className="text-lg font-extrabold tracking-tight">{point.title}</h3>
              <p className="text-[15px] leading-relaxed text-foreground/80">{point.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
