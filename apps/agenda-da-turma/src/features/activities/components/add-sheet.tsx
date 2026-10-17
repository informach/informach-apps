"use client";

import { Button } from "@informach/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@informach/ui/components/sheet";
import { cn } from "@informach/ui/lib/utils";
import { Camera, MessageSquareText, Mic, Pencil, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { AddEntitlement } from "@/features/notices/entitlement";
import { readLastChild, rememberLastChild } from "@/features/notices/last-child";
import { StudentAvatar } from "@/features/students/components/student-avatar";

/**
 * O gesto único de trazer uma atividade para dentro: "O que chegou?".
 *
 * Antes deste componente o mesmo destino (`/recados/novo`) era alcançado por
 * quatro rótulos diferentes, e um quinto caminho, Pro-only, vivia escondido num
 * `<details>`. Agora há um caminho por tipo de entrada, todos desembocando na
 * mesma revisão, e a franquia aparece uma vez, no rodapé.
 *
 * A criança vem antes do caminho, no topo da folha, lembrando a última
 * escolhida neste aparelho: numa casa com dois filhos, escolher para quem é o
 * recado era um campo no meio do formulário, depois de a pessoa já ter tirado
 * a foto.
 */
const OPTIONS = [
  {
    key: "foto",
    href: "/recados/novo?modo=foto",
    icon: Camera,
    label: "Foto",
    hint: "agenda, caderno, cartaz ou print",
  },
  {
    key: "colar",
    href: "/recados/novo?modo=colar",
    icon: MessageSquareText,
    label: "Mensagem",
    hint: "colar, ou compartilhar do WhatsApp",
  },
  {
    key: "falar",
    href: "/recados/novo?modo=falar",
    icon: Mic,
    label: "Falar",
    hint: "de mãos ocupadas",
  },
  {
    key: "escrever",
    href: "/atividades/nova",
    icon: Pencil,
    label: "Escrever",
    hint: "você digita, sem leitura",
  },
] as const;

export function AddSheet({
  profileId,
  profiles = [],
  entitlement,
  label = "Adicionar",
  hideLabel = false,
  icon = "plus",
  variant = "default",
  size,
  className,
}: {
  /** A criança em foco na tela de onde a folha abriu (`?perfil=`). */
  profileId?: string | null;
  /** As crianças que este adulto acompanha, para escolher no topo da folha. */
  profiles?: Array<{ id: string; name: string }>;
  /**
   * Plano e franquia **do titular** da criança em foco, não de quem está
   * olhando: um segundo adulto convidado usa o plano da família.
   */
  entitlement: AddEntitlement;
  label?: string;
  /** Rodapé usa só o ícone; o nome acessível continua vindo de `label`. */
  hideLabel?: boolean;
  icon?: "plus" | "sparkles";
  variant?: "default" | "outline";
  size?: "sm";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const known = (id: string | null | undefined) =>
    id && profiles.some((p) => p.id === id) ? id : null;
  // A escolha desta abertura, depois a criança da tela, depois a última deste
  // aparelho. Lido ao abrir, e não no render inicial: `localStorage` não existe
  // no servidor.
  const selected = known(chosen) ?? known(profileId) ?? profiles[0]?.id ?? null;
  const withProfile = (href: string) => {
    if (!selected) return href;
    return `${href}${href.includes("?") ? "&" : "?"}perfil=${encodeURIComponent(selected)}`;
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Cada abertura começa de novo: a criança da tela, ou a última deste
        // aparelho. A escolha de uma abertura não vale para a seguinte, porque
        // o rodapé mora no layout e sobrevive à navegação.
        if (next) setChosen(profileId ? null : known(readLastChild()));
        setOpen(next);
      }}
    >
      {/*
        O gatilho é construído aqui dentro, e não recebido como elemento: um
        elemento criado num Server Component não sobrevive ao `asChild` do
        Radix, e a folha sumia da tela sem erro nenhum.
      */}
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          aria-label={hideLabel ? label : undefined}
        >
          {icon === "sparkles" ? (
            <Sparkles className="size-4" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          {hideLabel ? null : label}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl p-0">
        <SheetHeader className="space-y-1 px-5 pt-5 text-left">
          <SheetTitle className="text-2xl font-extrabold tracking-tight">O que chegou?</SheetTitle>
          <SheetDescription className="sr-only">
            Escolha para quem é e por onde o recado chegou.
          </SheetDescription>
        </SheetHeader>
        {profiles.length > 1 ? (
          <fieldset className="mt-3 px-5">
            <legend className="mb-2 text-sm font-semibold text-muted-foreground">Para</legend>
            <div className="flex flex-wrap gap-2">
              {profiles.map((p) => {
                const on = p.id === selected;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen(p.id)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-bold",
                      on
                        ? "bg-foreground text-background"
                        : "border border-foreground/15 bg-background hover:bg-muted",
                    )}
                  >
                    <StudentAvatar name={p.name} size="pill" className="border" />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <ul className="mt-4 grid grid-cols-2 gap-2 px-5">
          {OPTIONS.map(({ key, href, icon: Icon, label, hint }) => (
            <li key={key}>
              <Link
                href={withProfile(href)}
                onClick={() => {
                  if (selected) rememberLastChild(selected);
                  setOpen(false);
                }}
                className="flex h-full min-h-24 flex-col gap-2 rounded-2xl border border-foreground/15 p-3.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
              >
                <Icon className="size-6" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold">{label}</span>
                  <span className="block text-sm leading-snug text-muted-foreground">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {/*
          Quando a franquia acaba, o rodapé deixa de ser um aviso seco: a mesma
          franquia é contada do lado do que a família ganhou, e o convite ao Pro
          vem no único momento em que ele responde a uma pergunta que a pessoa
          acabou de fazer. Escrever à mão continua livre, e continua na lista.
        */}
        {!entitlement.isPro && entitlement.trialLeft === 0 ? (
          <div className="mt-4 space-y-3 border-t border-foreground/15 px-5 py-4">
            <p className="text-sm">
              Os recados de teste acabaram.
              {entitlement.organizedFromNotices > 0 ? (
                <>
                  {" "}
                  Com eles, a Agenda organizou{" "}
                  <strong className="font-bold">
                    {entitlement.organizedFromNotices === 1
                      ? "1 atividade"
                      : `${entitlement.organizedFromNotices} atividades`}
                  </strong>{" "}
                  para vocês.
                </>
              ) : null}
            </p>
            <Button asChild className="min-h-11 w-full rounded-xl font-bold">
              <Link href="/upgrade" onClick={() => setOpen(false)}>
                Ver o Pro
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">Escrever à mão continua livre.</p>
          </div>
        ) : (
          <p className="mt-4 border-t border-foreground/15 px-5 py-3 text-sm text-muted-foreground">
            Você confere antes de salvar.{" "}
            {entitlement.isPro ? (
              entitlement.readsLeft === null ? null : entitlement.readsLeft === 0 ? (
                // Sem leitura, os caminhos de foto, mensagem e fala respondem
                // com erro: melhor dizer antes, e dizer a saída. Escrever
                // continua livre.
                <>
                  <strong className="font-bold text-foreground">
                    As leituras deste mês acabaram.
                  </strong>{" "}
                  {entitlement.isBillingOwner ? (
                    <Link
                      href="/settings/billing"
                      onClick={() => setOpen(false)}
                      className="font-bold text-primary-ink underline"
                    >
                      Ver mais leituras
                    </Link>
                  ) : (
                    "Quem assina a Agenda pode comprar mais."
                  )}
                </>
              ) : (
                <strong className="font-bold text-foreground">
                  {entitlement.readsLeft === 1
                    ? "Sobra 1 leitura (ditado usa duas)."
                    : `Sobram ${entitlement.readsLeft} leituras.`}
                </strong>
              )
            ) : (
              <strong className="font-bold text-foreground">
                {entitlement.trialLeft === 1
                  ? "A Agenda ainda lê 1 recado de graça."
                  : `A Agenda ainda lê ${entitlement.trialLeft} recados de graça.`}
              </strong>
            )}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
