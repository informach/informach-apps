import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { AgendaLogo } from "@/components/brand/agenda-logo";
import { requireUserServer } from "@/lib/auth";
import { UserMenu } from "./user-menu";

/**
 * O logotipo e a conta. O botão "Seja Pro" que morava aqui saiu com a página
 * do dia: o Pro aparece quando faz falta (os recados de teste acabaram, a
 * segunda criança, o segundo adulto, a semana para imprimir), cada porta com o
 * seu motivo, e não em todas as telas de quem está no grátis.
 */
export async function AppHeader() {
  const user = await requireUserServer();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* O logotipo é quem cede espaço. Num telefone de 360 px, o wordmark
            somado ao tema e ao avatar já passou da tela uma vez, e o app
            inteiro rolava de lado. */}
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center"
          aria-label="Agenda da Turma, ir para o início"
        >
          <AgendaLogo className="h-8 w-auto max-w-full text-foreground" />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle />
          <UserMenu
            user={{
              id: user.id,
              name: user.name ?? null,
              email: user.email,
              image: user.image ?? null,
            }}
          />
        </div>
      </div>
    </header>
  );
}
