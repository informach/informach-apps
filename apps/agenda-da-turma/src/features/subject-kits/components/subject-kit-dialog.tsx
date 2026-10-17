"use client";

import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Backpack, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { catchActionResult } from "@/lib/action-result";
import { saveSubjectKitAction } from "../actions";
import { MAX_KIT_ITEM_LENGTH, MAX_KIT_ITEMS } from "../schemas";

const CHIP_DOT: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/**
 * "Levar sempre": o que vai na mochila toda vez que a matéria tem aula.
 *
 * Tênis na educação física, flauta na música. A alternativa era cadastrar
 * lembretes semanais repetidos — vinte obrigações para marcar como feitas, no
 * lugar de uma lista de três itens que só precisa ser lembrada.
 */
export function SubjectKitDialog({
  profileId,
  subjectId,
  profileSubjectId,
  subjectName,
  profileName,
  items: initialItems,
  variant = "button",
  colorIndex = null,
  note = null,
}: {
  profileId: string;
  subjectId: string | null;
  profileSubjectId: string | null;
  subjectName: string;
  profileName: string;
  items: string[];
  /**
   * `chip`: a própria aula vira o gatilho, como pílula com o ponto da cor da
   * matéria (é assim que "Hoje na escola" lista as aulas). `button`: o botão
   * "Levar sempre" ao lado de uma linha que já nomeia a matéria.
   */
  variant?: "button" | "chip";
  colorIndex?: number | null;
  /** Complemento da pílula: "fora da escola", "reveza com Artes". */
  note?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>(initialItems.length ? initialItems : [""]);
  const [pending, startTransition] = useTransition();

  const change = (index: number, value: string) =>
    setItems((current) => current.map((item, i) => (i === index ? value : item)));

  return (
    <>
      {variant === "chip" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${subjectName}${note ? `, ${note}` : ""}. Levar sempre${
            initialItems.length ? `: ${initialItems.join(", ")}` : ""
          }`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-foreground/15 bg-background px-3 text-[13px] font-semibold hover:bg-muted"
        >
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              colorIndex ? CHIP_DOT[colorIndex] : "bg-foreground/60",
            )}
          />
          {subjectName}
          {note ? <span className="font-medium text-muted-foreground">· {note}</span> : null}
          {initialItems.length ? (
            <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
              <Backpack className="size-3.5" aria-hidden />
              {initialItems.join(", ")}
            </span>
          ) : null}
        </button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 gap-1.5 text-xs"
          onClick={() => setOpen(true)}
        >
          <Backpack className="size-3.5" aria-hidden />
          {initialItems.length ? `Levar sempre (${initialItems.length})` : "Levar sempre"}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Levar sempre em {subjectName}</DialogTitle>
            <DialogDescription>
              O que {profileName} leva toda vez que tem essa aula. Aparece na mochila de amanhã, sem
              virar atividade para concluir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: a lista é posicional e editável em qualquer linha
                key={index}
                className="flex items-center gap-2"
              >
                <Input
                  value={item}
                  maxLength={MAX_KIT_ITEM_LENGTH}
                  placeholder="Tênis, garrafa de água…"
                  aria-label={`Item ${index + 1}`}
                  onChange={(event) => change(index, event.target.value)}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover item ${index + 1}`}
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            {items.length < MAX_KIT_ITEMS ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((current) => [...current, ""])}
              >
                <Plus className="mr-2 size-3.5" aria-hidden />
                Acrescentar
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await catchActionResult(() =>
                    saveSubjectKitAction({
                      profileId,
                      subjectId,
                      profileSubjectId,
                      items: items.map((item) => item.trim()).filter(Boolean),
                    }),
                  );
                  if (!result.ok) {
                    toast.error("Não foi possível salvar a lista.");
                    return;
                  }
                  toast.success("Lista salva");
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
