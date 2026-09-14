import { Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Mascote } from "@/components/mascote";
import { NavegacaoInferior, Navigation } from "@/components/navigation";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { SignOut } from "@/components/sign-out";
import { getCurrentUser } from "@/lib/auth";
import { currentDashboard } from "@/lib/view";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  if (!user.emailVerified) redirect("/entrar?confirmar=1");
  const data = await currentDashboard();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[var(--ms-rail)_minmax(0,1fr)]">
      {/* Rail lateral: só no desktop. No celular a navegação é a barra inferior. */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r-2 border-sombra bg-creme px-5 py-7 lg:flex">
        <Brand />
        <div className="mt-9">
          <Navigation />
        </div>
        <div className="mt-auto pt-6">
          <div className="flex items-center gap-3 rounded-card border-2 border-lima-fundo/40 bg-lima/30 p-3">
            <Mascote humor="acolhendo" tamanho="pp" />
            <p className="text-sm leading-snug font-semibold text-tinta">
              Entender uma ideia vale mais que correr por dez.
            </p>
          </div>
          <Link
            href="/sobre"
            className="mt-3 inline-block text-sm font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta"
          >
            Como aprendemos ↗
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b-2 border-sombra bg-papel/95 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <Brand compacto />
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ProfileSwitcher profiles={data.profiles} selected={data.profile?.id} />
            {/* A área da família sai da navegação da criança: é do responsável,
                e já exige reautenticação de 10 minutos. */}
            <Link
              href="/familia"
              aria-label="Área da família"
              className="grid size-11 place-items-center rounded-full border-2 border-sombra bg-creme text-tinta-suave transition-colors hover:text-tinta"
            >
              <Users size={20} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <main
          id="conteudo"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-14"
        >
          {children}
        </main>

        <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t-2 border-sombra px-4 py-5 pb-24 text-xs text-tinta-suave sm:px-6 lg:px-8 lg:pb-5">
          <span>Conteúdo autoral · preparação independente, sem vínculo com as olimpíadas.</span>
          <Link href="/privacidade" className="underline underline-offset-4 hover:text-tinta">
            Privacidade
          </Link>
          <SignOut />
        </footer>
      </div>

      <NavegacaoInferior />
    </div>
  );
}
