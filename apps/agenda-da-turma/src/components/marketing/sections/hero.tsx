import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { ArrowRight, FileText, ImagePlus, Mic } from "lucide-react";
import Link from "next/link";
import { HeroActivityCards } from "@/components/marketing/hero-activity-cards";

const CAPTURE_MODES = [
  { icon: Mic, label: "Voz" },
  { icon: ImagePlus, label: "Foto" },
  { icon: FileText, label: "PDF" },
] as const;

export function Hero() {
  return (
    <section
      id="inicio"
      className="container mx-auto grid items-center gap-10 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-28"
    >
      <div className="space-y-6 lg:space-y-7">
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
          Agenda escolar sem caderninho perdido
        </Badge>

        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
          A agenda dos seus filhos num lugar só.{" "}
          <span className="text-primary">Sem caderno rasgado, sem print no WhatsApp.</span>
        </h1>

        <p className="max-w-xl text-pretty text-lg text-muted-foreground leading-relaxed">
          Cadastra a prova falando, manda foto do quadro da semana, joga o PDF que a escola mandou.
          Em segundos vira lista com data, matéria e o nome do filho certo.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/signup">
              Começar grátis
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#ia-demo">Ver como funciona</Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {CAPTURE_MODES.map(({ icon: Icon, label }, i) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-sm font-medium text-primary motion-safe:animate-pulse-glow"
              style={{ animationDelay: `${i * 0.4}s` }}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </span>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          Grátis pra começar · Sem cartão · Cancela quando quiser
        </p>
      </div>

      <div className="relative">
        <HeroActivityCards />
      </div>
    </section>
  );
}
