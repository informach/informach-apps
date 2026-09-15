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
import { Camera, ClipboardType, Mic, Pencil, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { AddEntitlement } from "@/features/notices/entitlement";

/**
 * O gesto único de trazer uma atividade para dentro.
 *
 * Antes deste componente o mesmo destino (`/recados/novo`) era alcançado por
 * quatro rótulos diferentes — "Importar mensagem ou foto", "Organizar recado",
 * "Organizar um recado" e "Tirar foto da agenda ou do caderno" — e um quinto
 * caminho, Pro-only, vivia escondido num `<details>` chamado ora "Ferramentas
 * por matéria", ora "Importar atividades". Quem usa não tinha como saber que
 * eram a mesma coisa, nem por que um cobrava e o outro não.
 *
 * Agora há um caminho por tipo de entrada, e todos desembocam na mesma tela de
 * revisão. A franquia aparece uma vez, aqui no rodapé, em vez de selos "Pro"
 * espalhados por três telas.
 */
const OPTIONS = [
  {
    key: "foto",
    href: "/recados/novo?modo=foto",
    icon: Camera,
    label: "Foto ou arquivo",
    hint: "Agenda, caderno, comunicado, print, PDF",
    tint: "bg-primary/10 text-primary-ink",
  },
  {
    key: "colar",
    href: "/recados/novo?modo=colar",
    icon: ClipboardType,
    label: "Colar mensagem",
    hint: "Teams, Batista ID, WhatsApp",
    tint: "bg-chart-2/15 text-chart-2-ink",
  },
  {
    key: "falar",
    href: "/recados/novo?modo=falar",
    icon: Mic,
    label: "Falar",
    hint: "Ditar a atividade, de mãos ocupadas",
    tint: "bg-chart-3/15 text-chart-3-ink",
  },
  {
    key: "escrever",
    href: "/atividades/nova",
    icon: Pencil,
    label: "Escrever",
    hint: "Digitar direto, sem IA",
    tint: "bg-chart-4/15 text-chart-4-ink",
  },
] as const;

export function AddSheet({
  profileId,
  entitlement,
  label = "Adicionar",
  hideLabel = false,
  icon = "plus",
  variant = "default",
  size,
  className,
}: {
  profileId?: string | null;
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
  const withProfile = (href: string) => {
    if (!profileId) return href;
    return `${href}${href.includes("?") ? "&" : "?"}perfil=${encodeURIComponent(profileId)}`;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
          <SheetTitle>Adicionar</SheetTitle>
          <SheetDescription>Como você quer trazer essa atividade?</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 flex flex-col">
          {OPTIONS.map(({ key, href, icon: Icon, label, hint, tint }) => (
            <li key={key} className="border-t">
              <Link
                href={withProfile(href)}
                onClick={() => setOpen(false)}
                className="flex min-h-16 items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tint}`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-muted-foreground">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {/*
          Quando a franquia acaba, o rodapé deixa de ser um aviso seco.
          Ele dizia "As importações de teste acabaram" — o custo, sem o
          benefício. Aqui a mesma franquia é contada do lado do que a família
          ganhou, e o convite ao Pro vem no único momento em que ele responde a
          uma pergunta que a pessoa acabou de fazer. Escrever à mão continua
          livre, e continua na lista acima.
        */}
        {!entitlement.isPro && entitlement.trialLeft === 0 ? (
          <div className="space-y-3 border-t bg-secondary/10 px-5 py-4">
            <p className="text-sm">
              {entitlement.organizedFromNotices > 0 ? (
                <>
                  A leitura já virou{" "}
                  <strong className="font-semibold">
                    {entitlement.organizedFromNotices === 1
                      ? "1 atividade"
                      : `${entitlement.organizedFromNotices} atividades`}
                  </strong>{" "}
                  na rotina de vocês. As importações de teste acabaram.
                </>
              ) : (
                "As importações de teste acabaram."
              )}
            </p>
            <Button asChild size="sm" className="w-full">
              <Link href="/upgrade" onClick={() => setOpen(false)}>
                Continuar com o Pro
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Escrever à mão continua livre, sem limite.
            </p>
          </div>
        ) : (
          <p className="border-t bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
            Você confere tudo antes de salvar.{" "}
            {entitlement.isPro ? (
              "Cada importação usa 1 crédito; por voz, 2."
            ) : (
              <strong className="font-semibold text-foreground">
                {entitlement.trialLeft === 1
                  ? "Resta 1 importação grátis."
                  : `Restam ${entitlement.trialLeft} importações grátis.`}
              </strong>
            )}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
