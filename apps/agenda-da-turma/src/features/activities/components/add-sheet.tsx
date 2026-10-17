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
import { PRO_READS_PER_MONTH } from "@/features/billing/plans-content";
import type { AddEntitlement } from "@/features/notices/entitlement";
import { readLastChild, rememberLastChild } from "@/features/notices/last-child";
import { handOffPhoto } from "@/features/notices/photo-handoff";

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

/** "58 de 70 leituras sobrando este mês." Com pacote comprado o saldo passa do mês, e a conta fica sem o "de 70". */
function readsSentence(left: number) {
  const total = left <= PRO_READS_PER_MONTH ? ` de ${PRO_READS_PER_MONTH}` : "";
  const word = left === 1 && !total ? "leitura" : "leituras";
  const note = left === 1 ? " O ditado usa duas." : "";
  return `${left}${total} ${word} sobrando este mês.${note}`;
}

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
                    className={cn(
                      "inline-flex min-h-10 relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] items-center rounded-full px-4 text-sm font-bold",
                      on
                        ? "bg-foreground text-background"
                        : "border border-foreground/20 bg-background hover:bg-muted",
                    )}
                  >
                    {p.name}
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
        {/*
          Quando a franquia acaba, o rodapé deixa de ser um aviso seco: a mesma
          franquia é contada do lado do que a família ganhou, e o convite ao Pro
          vem no único momento em que ele responde a uma pergunta que a pessoa
          acabou de fazer. Escrever à mão continua livre, e continua na lista.
        */}
        {!entitlement.isPro && entitlement.trialLeft === 0 ? (
          <div className="space-y-3 border-t border-foreground/15 px-5 pt-3.5">
            <p className="text-sm leading-normal">
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
          <p className="border-t border-foreground/15 px-5 pt-3.5 text-sm leading-normal text-muted-foreground">
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
                readsSentence(entitlement.readsLeft)
              )
            ) : entitlement.trialLeft === 1 ? (
              "A Agenda ainda lê 1 recado de graça."
            ) : (
              `A Agenda ainda lê ${entitlement.trialLeft} recados de graça.`
            )}
          </p>
        )}
      </DrawerContent>
    </Drawer>
  );
}
