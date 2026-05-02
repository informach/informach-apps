import { Button } from "@informach/ui/components/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function FinalCta() {
  return (
    <section className="container mx-auto px-4 py-20 md:py-28">
      <div className="relative overflow-hidden rounded-3xl bg-secondary px-6 py-16 text-secondary-foreground shadow-xl md:px-16 md:py-24">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-primary/30 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-10 size-72 rounded-full bg-primary/20 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            Pare de procurar receita.
            <br />
            Comece a cozinhar.
          </h2>
          <p className="mt-5 text-pretty text-base text-secondary-foreground/80 leading-relaxed md:text-lg">
            Cadastre-se grátis em 30 segundos. Sem cartão. Sem fidelidade.
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
