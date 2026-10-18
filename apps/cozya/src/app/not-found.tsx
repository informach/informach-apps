import { Button } from "@informach/ui/components/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="space-y-3">
        <p className="font-bold text-7xl text-brand-ink tracking-tight md:text-8xl">404</p>
        <h1 className="text-balance font-semibold text-2xl tracking-tight md:text-3xl">
          Esta página não está na cozinha.
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground text-pretty">
          O link pode estar quebrado ou a página mudou de lugar. Volte para o início ou para o Hoje.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" asChild>
          <Link href="/">Voltar para o início</Link>
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <Link href="/hoje">Ir para Hoje</Link>
        </Button>
      </div>
    </main>
  );
}
