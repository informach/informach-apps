import { Button } from "@informach/ui/components/button";
import { ArrowRight, FileText, ImagePlus, Mic } from "lucide-react";
import Link from "next/link";

const CAPTURE_ICONS = [
  { icon: Mic, label: "voz" },
  { icon: ImagePlus, label: "foto" },
  { icon: FileText, label: "PDF" },
] as const;

export function FinalCta() {
  return (
    <section className="container mx-auto px-4 py-20 md:py-28">
      <div className="relative overflow-hidden rounded-3xl bg-secondary px-6 py-16 text-secondary-foreground shadow-xl md:px-16 md:py-24">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-primary/30 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-10 size-72 rounded-full bg-chart-3/30 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-2xl text-center">
          <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-secondary-foreground/20 bg-secondary-foreground/5 px-4 py-2 text-sm">
            {CAPTURE_ICONS.map(({ icon: Icon, label }, i) => (
              <span key={label} className="flex items-center gap-1.5">
                <Icon className="size-4 text-primary" aria-hidden />
                <span className="text-secondary-foreground/90">{label}</span>
                {i < CAPTURE_ICONS.length - 1 && (
                  <span className="ml-1 text-primary/50" aria-hidden>
                    ·
                  </span>
                )}
              </span>
            ))}
          </div>

          <h2 className="mt-7 text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            Pare de virar agenda das crianças.
            <br />
            Comece a acompanhar de verdade.
          </h2>
          <p className="mt-5 text-pretty text-base text-secondary-foreground/80 leading-relaxed md:text-lg">
            Em 30 segundos você cria a conta. Em 1 minuto a primeira prova já tá no calendário.
            Grátis pra começar, sem cartão, sem fidelidade.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/signup">
                Criar conta grátis
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>

          <p className="mt-6 text-sm text-secondary-foreground/70">
            Já tem conta?{" "}
            <Link
              href="/login"
              className="font-medium text-secondary-foreground underline underline-offset-4 hover:text-primary"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
