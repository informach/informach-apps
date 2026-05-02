import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HeroRecipeCards } from "@/components/marketing/hero-recipe-cards";

export function Hero() {
  return (
    <section
      id="inicio"
      className="container mx-auto grid items-center gap-12 px-4 py-20 md:py-28 lg:grid-cols-[1.1fr_1fr] lg:gap-16"
    >
      <div className="space-y-7">
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
          Receitas rápidas, sem caos
        </Badge>

        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
          Suas receitas, prontas em segundos.{" "}
          <span className="text-primary">Não em mil prints.</span>
        </h1>

        <p className="max-w-xl text-pretty text-lg text-muted-foreground leading-relaxed">
          Capture do print, do texto, da câmera ou da sua voz. O Cozya transforma em um card limpo,
          fácil de achar e perfeito pra cozinhar no celular.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/signup">
              Começar grátis
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Já tenho conta</Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Grátis pra começar. Sem cartão. PWA que funciona offline.
        </p>
      </div>

      <div className="relative hidden lg:block">
        <HeroRecipeCards />
      </div>
    </section>
  );
}
