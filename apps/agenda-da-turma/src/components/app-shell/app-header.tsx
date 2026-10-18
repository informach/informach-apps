import Link from "next/link";
import { Suspense } from "react";
import { AgendaSymbol } from "@/components/brand/agenda-logo";
import { requireUserServer } from "@/lib/auth";
import { DesktopAddButton } from "./desktop-add-button";
import { DesktopNav } from "./desktop-nav";
import { getShellData } from "./shell-data";
import { UserMenu } from "./user-menu";

async function AccountMenu() {
  const user = await requireUserServer();
  return (
    <UserMenu
      user={{
        id: user.id,
        name: user.name ?? null,
        email: user.email,
        image: user.image ?? null,
      }}
    />
  );
}

async function DesktopAdd({ userId }: { userId: string }) {
  const { entitlement, profiles } = await getShellData(userId);
  return (
    <DesktopAddButton
      profiles={profiles}
      entitlement={entitlement}
      label="Adicionar"
      className="min-h-11 gap-2 rounded-xl px-[18px] text-[15px] font-extrabold shadow-solid-primary [&_svg]:size-[18px] [&_svg]:stroke-[2.6]"
    />
  );
}

/**
 * A barra de cima do computador: o símbolo e o nome, os quatro destinos, o
 * "Adicionar" e a conta. No celular quem navega é o rodapé, e o cabeçalho (o
 * símbolo e a conta) aparece só em Hoje (`MobileTopBar`), como no canvas: as
 * outras telas começam pelo próprio título.
 *
 * O botão "Seja Pro" que morava aqui saiu com a página do dia: o Pro aparece
 * quando faz falta, cada porta com o seu motivo.
 */
export async function DesktopHeader() {
  const user = await requireUserServer();
  return (
    <header className="sticky top-0 z-40 hidden h-[68px] border-b border-foreground/15 bg-background/70 backdrop-blur lg:block">
      <div className="mx-auto flex h-full max-w-[1180px] items-center gap-9 px-5">
        <Link
          href="/dashboard"
          className="flex min-h-11 items-center gap-2.5"
          aria-label="Agenda da Turma, ir para Hoje"
        >
          <AgendaSymbol aria-hidden />
          <span aria-hidden className="text-lg font-extrabold tracking-[-0.02em]">
            agenda da turma
          </span>
        </Link>
        <DesktopNav />
        <span className="flex-1" />
        <Suspense fallback={null}>
          <DesktopAdd userId={user.id} />
        </Suspense>
        <AccountMenu />
      </div>
    </header>
  );
}

/** O cabeçalho de Hoje no celular: o símbolo e a conta. */
export async function MobileTopBar() {
  return (
    <header className="-mx-4 flex h-14 items-center justify-between px-4 lg:hidden">
      <Link
        href="/dashboard"
        className="flex min-h-11 items-center"
        aria-label="Agenda da Turma, ir para Hoje"
      >
        <AgendaSymbol aria-hidden />
      </Link>
      <AccountMenu />
    </header>
  );
}
