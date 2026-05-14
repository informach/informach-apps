import { Button } from "@informach/ui/components/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="space-y-3">
        <p className="font-bold text-7xl text-primary tracking-tight md:text-8xl">404</p>
        <h1 className="text-balance font-semibold text-2xl tracking-tight md:text-3xl">
          Essa receita ainda não foi criada.
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground text-pretty">
          O link que você seguiu pode estar quebrado ou a página pode ter sido movida. Que tal
          voltar e tentar de novo?
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" asChild>
          <Link href="/">Voltar para o início</Link>
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <Link href="/dashboard">Ir para minhas receitas</Link>
        </Button>
      </div>
    </main>
  );
}
