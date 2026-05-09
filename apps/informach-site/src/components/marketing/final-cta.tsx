import { Button } from "@informach/ui/components/button";
import { ArrowRight, ExternalLink } from "lucide-react";
import { SITE } from "@/lib/site";

export function FinalCta() {
  return (
    <section className="bg-background">
      <div className="container mx-auto px-4 py-20 md:py-24">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-8">
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Quero usar</p>
            <h3 className="text-2xl font-semibold tracking-tight">Conhece os apps da Informach.</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Soluções prontas, feitas com cuidado, pra dores que cabem no seu dia a dia.
            </p>
            <div className="mt-2">
              <Button asChild>
                <a href="#apps">
                  Ver apps
                  <ArrowRight className="ml-2 size-4" aria-hidden />
                </a>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-8">
            <p className="text-sm font-medium uppercase tracking-wider text-secondary">
              Quero aprender
            </p>
            <h3 className="text-2xl font-semibold tracking-tight">
              Construa seus próprios sistemas com IA.
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Entre na {SITE.communityName} e aprenda a pensar, planejar e colocar sistemas reais no
              mundo.
            </p>
            <div className="mt-2">
              <Button variant="outline" asChild>
                <a href={SITE.communityUrl} target="_blank" rel="noopener noreferrer">
                  Entrar na comunidade
                  <ExternalLink className="ml-2 size-4" aria-hidden />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
