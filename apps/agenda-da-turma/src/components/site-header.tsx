import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { AgendaLogo } from "@/components/brand/agenda-logo";

/**
 * Header sticky usado pelas páginas de auth (`/login`, `/signup`).
 * A Agenda da Turma ainda não tem landing pública, então o header começa
 * minimalista — só logotipo + botão de troca de tema. Quando uma landing
 * entrar no futuro, evoluir para o pattern variant igual o site-header
 * do Cozya (`apps/cozya/src/components/marketing/site-header.tsx`).
 *
 * Server Component. `ModeToggle` é o único filho client.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center" aria-label="Agenda da Turma, início">
          <AgendaLogo className="h-8 w-auto text-foreground" aria-hidden="true" />
        </Link>

        <div className="flex items-center gap-1">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
