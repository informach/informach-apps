import { HeartHandshake, Sparkles, Wrench } from "lucide-react";

const PILLARS = [
  {
    icon: Sparkles,
    title: "Pra pessoa comum",
    body: "Não fazemos enterprise. Fazemos pra quem cozinha em casa, pra quem dá aula, pra quem só quer resolver uma coisa sem complicação.",
  },
  {
    icon: HeartHandshake,
    title: "Cada app nasce de uma dor real",
    body: "A gente vive a dor antes de codar. Se não passa no teste do dia a dia, não vira produto.",
  },
  {
    icon: Wrench,
    title: "Pequeno, com cuidado",
    body: "Nada de inflar feature pra justificar preço. Pequeno, polido, e que faz uma coisa muito bem feita.",
  },
] as const;

export function Manifesto() {
  return (
    <section id="manifesto" className="border-b border-border/40 bg-background">
      <div className="container mx-auto px-4 py-20 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-secondary">Manifesto</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            A gente acredita em apps que cabem na rotina.
          </h2>
          <p className="mt-4 text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            Tem muito app que tenta ser tudo pra todo mundo e acaba ajudando ninguém. Aqui a gente
            faz o oposto: cada produto resolve uma dor específica, e resolve direito.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
