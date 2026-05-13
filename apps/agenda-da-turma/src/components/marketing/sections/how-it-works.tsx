import { CalendarCheck, type LucideIcon, PenLine, Sparkles } from "lucide-react";

type Step = {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    number: "01",
    icon: Sparkles,
    title: "Capture",
    description:
      "Fala no microfone, tira foto do quadro ou envia o PDF. Vale print de WhatsApp, foto do caderno, agenda em papel, calendário da escola. Tudo entra.",
  },
  {
    number: "02",
    icon: PenLine,
    title: "Revise",
    description:
      "A IA monta a lista com data, matéria, tipo (prova, trabalho, lição) e qual filho é. Você confere e ajusta antes de salvar. Nada vai pro calendário sem a sua confirmação.",
  },
  {
    number: "03",
    icon: CalendarCheck,
    title: "Acompanhe",
    description:
      "Dashboard mostra atrasadas, hoje e próximos 7 dias. Calendário em mês, semana ou dia, cada matéria com sua cor. Marca como terminada com um clique.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Como funciona</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Três passos. Do caderno bagunçado pro calendário organizado.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          Sem digitar tarefa por tarefa. Sem garimpar foto antiga no WhatsApp.
        </p>
      </div>

      <ol className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
        {STEPS.map(({ number, icon: Icon, title, description }) => (
          <li
            key={number}
            className="group relative rounded-2xl border border-border/70 bg-card p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span
                className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15"
                aria-hidden
              >
                <Icon className="size-6" />
              </span>
              <span
                className="font-mono text-3xl font-semibold tracking-tight text-primary/40"
                aria-hidden
              >
                {number}
              </span>
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
