"use client";

import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Camera, ClipboardPaste, Mic, Pencil, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { startTrialAction } from "@/features/kitchen/actions";
import { catchActionResult } from "./action-errors";

type Method = "image" | "text" | "voice" | "prompt" | "manual";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canUseAi: boolean;
  /** No trial yet: tapping a paid method first activates the 14 free days. */
  trialAvailable: boolean;
  credits: number | null;
  hasRecentPreviews: boolean;
  onPick: (method: Method) => void;
};

const METHODS: { method: Method; icon: ReactNode; title: string; hint: string; ai: boolean }[] = [
  {
    method: "image",
    icon: <Camera className="size-[22px]" aria-hidden />,
    title: "Foto do caderno ou do print",
    hint: "Letra de mão também vale",
    ai: true,
  },
  {
    method: "text",
    icon: <ClipboardPaste className="size-[22px]" aria-hidden />,
    title: "Colar o texto",
    hint: "Da mensagem, do site, do bloco de notas",
    ai: true,
  },
  {
    method: "voice",
    icon: <Mic className="size-[22px]" aria-hidden />,
    title: "Contar em voz alta",
    hint: "Como você ensinaria alguém",
    ai: true,
  },
  {
    method: "prompt",
    icon: <Search className="size-[22px]" aria-hidden />,
    title: "Pedir para a IA encontrar",
    hint: "Diga o prato; vem com a fonte",
    ai: true,
  },
  {
    method: "manual",
    icon: <Pencil className="size-[22px]" aria-hidden />,
    title: "Escrever do meu jeito",
    hint: "Nome, ingredientes e passos",
    ai: false,
  },
];

export function NewRecipeMethodDialog({
  open,
  onOpenChange,
  canUseAi,
  trialAvailable,
  credits,
  hasRecentPreviews,
  onPick,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blocked, setBlocked] = useState(false);

  const choose = (method: Method, ai: boolean) => {
    if (!ai || canUseAi) {
      onPick(method);
      return;
    }
    if (!trialAvailable) {
      setBlocked(true);
      return;
    }
    startTransition(async () => {
      const result = await catchActionResult(() => startTrialAction({}));
      if (!result.ok) {
        setBlocked(true);
        return;
      }
      toast.success("Seus 14 dias grátis começaram. Você tem 3 créditos de IA.");
      router.refresh();
      onPick(method);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) setBlocked(false);
        onOpenChange(value);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[92dvh] gap-3.5 overflow-y-auto rounded-3xl px-5 pt-5 pb-[22px] sm:max-w-lg sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-[26px] max-sm:border-x-0 max-sm:border-b-0"
      >
        <div className="flex items-center justify-between gap-3">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[28px] font-extrabold tracking-display">
              Trazer uma receita
            </DialogTitle>
          </DialogHeader>
          <DialogClose
            aria-label="Fechar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-[18px]" strokeWidth={2.4} aria-hidden />
          </DialogClose>
        </div>
        <DialogDescription className="text-[15px] leading-normal text-ink-soft">
          De onde ela vem? Você sempre confere antes de guardar.
        </DialogDescription>

        <ul className="space-y-2">
          {METHODS.map(({ method, icon, title, hint, ai }, index) => (
            <li key={method}>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(method, ai)}
                className={cn(
                  "flex min-h-[68px] w-full items-center gap-3.5 rounded-2xl border bg-card px-3.5 py-2.5 text-left outline-none transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring",
                  index === 0 ? "border-2 border-primary" : "border-border",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl",
                    index === 0 ? "bg-peach text-peach-ink" : "bg-muted",
                  )}
                >
                  {icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold leading-snug">{title}</span>
                  <span className="text-[13px] text-muted-foreground">{hint}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-extrabold",
                    ai ? "text-muted-foreground" : "text-sage-ink",
                  )}
                >
                  {ai ? "1 crédito" : "sem crédito"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {blocked ? (
          <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4">
            <p className="font-bold">A ajuda da IA faz parte do Pro.</p>
            <p className="text-sm text-muted-foreground">
              Este e-mail já usou o teste grátis. Escrever do seu jeito continua sem crédito.
            </p>
            <Button asChild className="min-h-11">
              <Link href="/upgrade">Conhecer o Pro</Link>
            </Button>
          </div>
        ) : (
          <p className="rounded-2xl bg-muted p-3.5 text-sm leading-relaxed">
            {canUseAi
              ? `${credits !== null ? `Você tem ${credits} ${credits === 1 ? "crédito" : "créditos"} de IA. ` : ""}O crédito só é usado quando a IA entrega uma receita; se ela não conseguir, ele volta.`
              : trialAvailable
                ? "Os 14 dias grátis incluem 3 créditos de IA, um por receita. Tocar numa opção com crédito começa o teste. Sem cartão."
                : "Escrever do seu jeito não usa crédito."}
          </p>
        )}

        {hasRecentPreviews && (
          <Link
            href="/receitas/recuperar"
            className="inline-flex min-h-11 items-center justify-center text-sm font-bold underline underline-offset-4"
          >
            Retomar a receita que a IA organizou há pouco
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}
