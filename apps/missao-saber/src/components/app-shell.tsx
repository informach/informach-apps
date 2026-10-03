import Link from "next/link";
import { ParentSpaceLink } from "@/features/study-access/components";
import { ContextBoundary } from "@/features/study-access/context-boundary";
import { Brand } from "./brand";
import { Mascote } from "./mascote";
import { NavegacaoInferior, Navigation } from "./navigation";
import { ProfileSwitcher } from "./profile-switcher";
import { SignOut } from "./sign-out";

type Profile = { id: string; nickname: string; grade: number; avatar: string };
type ShellContext =
  | { audience: "parent" }
  | { audience: "study"; profiles: Profile[]; selected: Profile | null };

export function AppShell({
  context,
  children,
}: {
  context: ShellContext;
  children: React.ReactNode;
}) {
  const grade = context.audience === "study" ? context.selected?.grade : undefined;
  const band =
    grade === undefined ? undefined : grade <= 5 ? "initial" : grade <= 9 ? "middle" : "secondary";
  return (
    <div
      data-audience={context.audience}
      data-school-band={band}
      className="min-h-dvh lg:grid lg:grid-cols-[var(--ms-rail)_minmax(0,1fr)]"
    >
      <ContextBoundary />
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sombra bg-creme px-5 py-7 lg:flex">
        <Brand />
        <p className="mt-6 text-xs font-bold tracking-wider text-tinta-suave uppercase">
          {context.audience === "parent" ? "Área do responsável" : "Área de estudo"}
        </p>
        <div className="mt-4">
          <Navigation audience={context.audience} />
        </div>
        <div className="mt-auto pt-6">
          {band === "initial" && <Mascote humor="acolhendo" tamanho="pp" className="mb-3" />}
          <p className="text-sm leading-relaxed text-tinta-suave">
            {context.audience === "parent"
              ? "Acompanhe as descobertas. Uma boa conversa também ajuda a aprender."
              : "Entender uma ideia vale mais que correr por dez."}
          </p>
          <Link
            href="/sobre"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            Como aprendemos
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-sombra bg-papel/95 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <Brand compacto />
          </div>
          <span className="hidden text-sm font-semibold text-tinta-suave lg:inline">
            {context.audience === "parent" ? "Área do responsável" : "Seu espaço de estudo"}
          </span>
          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            {context.audience === "study" ? (
              <>
                <ProfileSwitcher profiles={context.profiles} selected={context.selected?.id} />
                <ParentSpaceLink />
              </>
            ) : (
              <span className="rounded-full bg-verde-claro px-3 py-2 text-xs font-semibold text-tinta lg:hidden">
                Responsável
              </span>
            )}
          </div>
        </header>
        <main
          id="conteudo"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-14"
        >
          {children}
        </main>
        <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sombra px-4 py-5 pb-24 text-xs text-tinta-suave sm:px-6 lg:px-8 lg:pb-5">
          <span>Conteúdo autoral · preparação independente, sem vínculo com as olimpíadas.</span>
          <Link
            href="/privacidade"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Privacidade
          </Link>
          <Link
            href="/termos"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Termos
          </Link>
          <SignOut />
        </footer>
      </div>
      <NavegacaoInferior audience={context.audience} />
    </div>
  );
}
