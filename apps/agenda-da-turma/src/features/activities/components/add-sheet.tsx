"use client";

import { Button } from "@informach/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@informach/ui/components/drawer";
import { cn } from "@informach/ui/lib/utils";
import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { CameraIcon, MessageIcon, MicIcon, PencilIcon } from "@/components/icons/canvas-icons";
import type { AddEntitlement } from "@/features/notices/entitlement";
import { readLastChild, rememberLastChild } from "@/features/notices/last-child";
import { handOffPhoto } from "@/features/notices/photo-handoff";
import { shortChildNames } from "@/features/students/utils";

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
 *
 * O desenho é o da prancha: uma folha de baixo com alça de arrastar (vaul, e
 * não a folha do Radix, para a alça ser de verdade), "Para" e as pílulas na
 * mesma linha, e um caminho por linha, com o ícone num quadrado na cor dele.
 */
const OPTIONS = [
  {
    key: "foto",
    href: "/recados/novo?modo=foto",
    icon: CameraIcon,
    label: "Foto",
    hint: "agenda, caderno, cartaz ou print",
    tile: "bg-chart-1/14 text-chart-1-ink",
  },
  {
    key: "colar",
    href: "/recados/novo?modo=colar",
    icon: MessageIcon,
    label: "Mensagem",
    hint: "colar, ou compartilhar do WhatsApp",
    tile: "bg-chart-2/14 text-chart-2-ink",
  },
  {
    key: "falar",
    href: "/recados/novo?modo=falar",
    icon: MicIcon,
    label: "Falar",
    hint: "de mãos ocupadas",
    tile: "bg-chart-3/14 text-chart-3-ink",
  },
  {
    key: "escrever",
    href: "/atividades/nova",
    icon: PencilIcon,
    label: "Escrever",
    hint: "você digita, sem leitura",
    tile: "bg-chart-4/14 text-chart-4-ink",
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const shortNames = shortChildNames(profiles);
  const known = (id: string | null | undefined) =>
    id && profiles.some((p) => p.id === id) ? id : null;
  // A escolha desta abertura, depois a criança da tela, depois a última deste
  // aparelho. Lido ao abrir, e não no render inicial: `localStorage` não existe
  // no servidor.
  const selected = known(chosen) ?? known(profileId) ?? profiles[0]?.id ?? null;
  const withProfile = (href: "/atividades/nova" | `/recados/novo?modo=${string}`) => {
    if (!selected) return href;
    return `${href}${href.includes("?") ? "&" : "?"}perfil=${encodeURIComponent(selected)}` as const;
  };

  return (
    <Drawer
      open={open}
      shouldScaleBackground={false}
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
      <DrawerTrigger asChild>
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
      </DrawerTrigger>
      <DrawerContent
        className="mx-auto max-w-lg rounded-t-[26px] border-0 bg-background pb-[calc(1.25rem+env(safe-area-inset-bottom))] outline-none"
        handleClassName="mt-2.5 mb-3 h-[5px] w-11 rounded-[9px] bg-card"
      >
        <div className="flex flex-col gap-3.5 px-5 pb-3.5">
          <DrawerTitle className="text-[26px] font-extrabold leading-tight tracking-[-0.03em]">
            O que chegou?
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Escolha para quem é e por onde o recado chegou.
          </DrawerDescription>
          {profiles.length > 1 ? (
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">Para qual criança</legend>
              <span aria-hidden className="mr-0.5 text-sm font-semibold text-muted-foreground">
                Para
              </span>
              {profiles.map((p) => {
                const on = p.id === selected;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen(p.id)}
                    title={p.name}
                    className={cn(
                      "relative inline-flex min-h-10 min-w-0 max-w-full items-center rounded-full px-4 text-sm font-bold after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']",
                      on
                        ? "bg-foreground text-background"
                        : "border border-foreground/20 bg-background hover:bg-muted",
                    )}
                  >
                    <span className="truncate">{shortNames.get(p.id)}</span>
                  </button>
                );
              })}
            </fieldset>
          ) : null}
        </div>
        <ul>
          {OPTIONS.map(({ key, href, icon: Icon, label, hint, tile }) => {
            const row: ReactNode = (
              <>
                <span
                  className={cn(
                    "flex size-[46px] shrink-0 items-center justify-center rounded-[14px]",
                    tile,
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-bold">{label}</span>
                  <span className="block text-sm text-muted-foreground">{hint}</span>
                </span>
              </>
            );
            const rowClass =
              "flex min-h-[72px] items-center gap-3.5 border-t border-foreground/15 px-4 py-2.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none";
            const allowed =
              !!selected &&
              (key === "escrever"
                ? entitlement.writeProfileIds
                : entitlement.aiProfileIds
              ).includes(selected);
            if (!allowed)
              return (
                <li key={key}>
                  <div aria-disabled="true" className={cn(rowClass, "opacity-50")}>
                    {row}
                    <span className="sr-only">Sem permissão para esta criança</span>
                  </div>
                </li>
              );
            return (
              <li key={key}>
                {key === "foto" ? (
                  // "Foto" abre a câmera (ou a galeria, para o print) daqui
                  // mesmo, como no canvas: a tela do recado já chega com a foto.
                  // Sem `capture`, o aparelho oferece as duas coisas.
                  <label
                    className={cn(
                      rowClass,
                      "cursor-pointer focus-within:bg-muted/60 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring",
                    )}
                  >
                    {row}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        handOffPhoto(file);
                        if (selected) rememberLastChild(selected);
                        setOpen(false);
                        // Um identificador por foto: já estando em /recados/novo, a
                        // tela remonta e pega esta foto, em vez de deixá-la presa
                        // para o recado seguinte.
                        router.push(withProfile(`${href}&foto=${Date.now().toString(36)}`));
                      }}
                    />
                  </label>
                ) : (
                  <Link
                    href={withProfile(href)}
                    onClick={() => {
                      if (selected) rememberLastChild(selected);
                      setOpen(false);
                    }}
                    className={rowClass}
                  >
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <div className="space-y-2 border-t border-foreground/15 px-5 pt-3.5 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">
              {entitlement.creditsAvailable} créditos disponíveis
            </strong>{" "}
            no saldo compartilhado do Compasso. O custo aparece antes de cada uso de IA.
          </p>
          <a
            href={entitlement.accountHref}
            onClick={() => setOpen(false)}
            className="font-bold text-primary-ink underline"
          >
            Ver saldo e assinatura
          </a>
          <p>Escrever à mão não usa créditos. Você confere antes de salvar.</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
