import { Button } from "@informach/ui/components/button";
import { BookOpen, ExternalLink, Layers, Users, Wrench } from "lucide-react";
import { SITE } from "@/lib/site";

const PERKS = [
  {
    icon: BookOpen,
    label: "Método",
    body: "Como pensar, planejar e construir sistemas reais — não só usar IA.",
  },
  {
    icon: Wrench,
    label: "Ferramentas próprias",
    body: "Templates, prompts e ferramentas que a gente usa pra construir os apps da Informach.",
  },
  {
    icon: Layers,
    label: "Cursos e eventos",
    body: "Aulas práticas, encontros ao vivo e materiais que cabem na rotina de quem trabalha.",
  },
  {
    icon: Users,
    label: "Apoio mútuo",
    body: "Outras pessoas no mesmo caminho. Sem feed mágico, sem influencer — só gente construindo.",
  },
] as const;

export function Community() {
  return (
    <section
      id="comunidade"
      className="relative overflow-hidden border-b border-border/40 bg-secondary/[0.04]"
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-secondary/10 via-background to-background" />
      <div className="container mx-auto px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-secondary">
            Pra quem quer aprender a construir
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            {SITE.communityName}
          </h2>
          <p className="mt-5 text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            Uma comunidade pra transformar ideias em sistemas digitais com IA — usando método,
            ferramentas próprias, templates, cursos, eventos e apoio de outras pessoas no mesmo
            caminho.
          </p>
          <p className="mt-4 text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            Aqui você não aprende só a usar IA. Você aprende a{" "}
            <span className="font-medium text-foreground">pensar, planejar, construir</span> e
            colocar sistemas reais no mundo.{" "}
            <span className="text-muted-foreground">
              Sem depender de tutorial pronto, sem começar perdido, sem construir no escuro.
            </span>
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2">
          {PERKS.map((perk) => {
            const Icon = perk.icon;
            return (
              <div
                key={perk.label}
                className="flex gap-4 rounded-xl border border-border/60 bg-card p-5"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                  <Icon className="size-5" aria-hidden />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">{perk.label}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{perk.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <a href={SITE.communityUrl} target="_blank" rel="noopener noreferrer">
              Entrar na {SITE.communityName}
              <ExternalLink className="ml-2 size-4" aria-hidden />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
