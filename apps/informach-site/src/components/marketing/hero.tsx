import { Button } from "@informach/ui/components/button";
import { ArrowRight, ExternalLink } from "lucide-react";
import { SITE } from "@/lib/site";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/40">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background" />
      <div className="container mx-auto px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Núcleo de Aprendizagem
          </p>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Apps com IA pra dores reais
            <br className="hidden md:inline" />{" "}
            <span className="text-secondary">do dia a dia.</span>
          </h1>
          <p className="mt-6 text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            A gente faz produtos pequenos, com cuidado, pra problemas que todo mundo tem mas ninguém
            se debruça pra resolver. E ensina quem quer aprender a fazer também.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <a href="#apps">
                Conhecer nossos apps
                <ArrowRight className="ml-2 size-4" aria-hidden />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={SITE.communityUrl} target="_blank" rel="noopener noreferrer">
                Entrar na comunidade
                <ExternalLink className="ml-2 size-4" aria-hidden />
              </a>
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Pra quem quer solução pronta · Pra quem quer aprender a construir
          </p>
        </div>
      </div>
    </section>
  );
}
