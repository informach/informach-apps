import { cn } from "@informach/ui/lib/utils";
import { EYEBROW, H2, SEC, SEC_LIGHT, WRAP } from "../landing-ui";

/** As quatro origens de data, cada uma com o traço da sua cor em cima, como na prancha. */
const POINTS = [
  {
    title: "A escola disse",
    text: "A data está no recado, e o trecho fica guardado junto da atividade.",
    rule: "border-solid border-foreground",
  },
  {
    title: "Na próxima aula",
    text: "Sem data no recado, a Agenda olha o horário da turma e avisa que fez a conta.",
    rule: "border-solid border-primary",
  },
  {
    title: "A confirmar",
    text: "Sem data e sem horário, fica a confirmar. Nada de “amanhã” chutado.",
    rule: "border-dashed border-muted-foreground",
  },
  {
    title: "Sem sinal no portão",
    text: "Marcar como feito funciona sem internet e sobe sozinho quando a rede volta.",
    rule: "border-solid border-chart-4",
  },
];

export function Trust() {
  return (
    <section id="confianca" aria-labelledby="trust-title" className={`${SEC} ${SEC_LIGHT}`}>
      <div className={`${WRAP} flex flex-col gap-11`}>
        <div className="flex max-w-[760px] flex-col gap-[18px]">
          <p className={EYEBROW}>Por que dá para confiar</p>
          <h2 id="trust-title" className={H2}>
            Nenhuma data entra na sua semana sem você ver de onde ela saiu.
          </h2>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-7">
          {POINTS.map((point) => (
            <li
              key={point.title}
              className={cn("flex flex-col gap-2.5 border-t-2 pt-[18px]", point.rule)}
            >
              <h3 className="text-[19px] font-bold">{point.title}</h3>
              <p className="text-base leading-[1.55] text-foreground/80">{point.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
