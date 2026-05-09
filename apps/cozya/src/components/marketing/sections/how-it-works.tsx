import { ChefHat, type LucideIcon, PenLine, Wand2 } from "lucide-react";

type Step = {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    number: "01",
    icon: Wand2,
    title: "Capture",
    description:
      "Cola texto, sobe foto, dita pelo microfone ou descreve em uma frase. A IA aceita print de WhatsApp, foto de caderno, áudio e prompt — e estrutura em segundos.",
  },
  {
    number: "02",
    icon: PenLine,
    title: "Revise",
    description:
      "A IA monta o card com nome, ingredientes e preparo. Você ajusta o que quiser antes de salvar — e ainda pode pedir refino conversacional ('faz vegana', 'metade das porções').",
  },
  {
    number: "03",
    icon: ChefHat,
    title: "Cozinhe",
    description:
      "Abre rápido no celular, busca por nome, marca favorito. Compartilha com a família pelo WhatsApp em 1 toque, com texto formatado.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Como funciona</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Três passos. Da fome até a panela.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          Sem digitar receita do zero. Sem garimpar print. Sem decorar passo a passo.
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
