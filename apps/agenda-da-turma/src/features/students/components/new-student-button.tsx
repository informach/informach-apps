"use client";

import { Button } from "@informach/ui/components/button";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { Plus } from "lucide-react";
import { useState } from "react";
import { StudentFormDialog } from "./student-form-dialog";

type Props = {
  isPro: boolean;
  currentCount: number;
  limit: number;
  variant?: "default" | "secondary";
  size?: "default" | "sm" | "lg";
  fullWidth?: boolean;
  /**
   * `dashed`: a linha tracejada no fim da lista de Família, com a conta
   * ("Adicionar criança (2 de 3)"), como no desenho aprovado.
   */
  appearance?: "button" | "dashed";
};

export function NewStudentButton({
  isPro,
  currentCount,
  limit,
  variant = "default",
  size = "default",
  fullWidth = false,
  appearance = "button",
}: Props) {
  const [open, setOpen] = useState(false);
  // Só abre o diálogo por JS: antes de hidratar, o toque sumiria sem aviso.
  const hydrated = useHydrated();
  const limitReached = currentCount >= limit;

  const dialog = (
    <StudentFormDialog
      open={open}
      onOpenChange={setOpen}
      isPro={isPro}
      currentCount={currentCount}
    />
  );

  if (appearance === "dashed")
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!hydrated}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-foreground/30 text-[15px] font-bold hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-[18px]" aria-hidden />
          Adicionar criança{" "}
          <span className="font-medium text-muted-foreground">
            ({currentCount} de {limit})
          </span>
        </button>
        {dialog}
      </>
    );

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={fullWidth ? "w-full" : undefined}
        title={
          limitReached
            ? isPro
              ? `Já são ${limit} crianças, o máximo do Pro.`
              : `O plano grátis tem ${limit} criança. No Pro cabem até três.`
            : undefined
        }
      >
        <Plus className="mr-2 size-4" aria-hidden />
        Adicionar criança
      </Button>

      {dialog}
    </>
  );
}
