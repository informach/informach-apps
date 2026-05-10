"use client";

import { Button } from "@informach/ui/components/button";
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
};

export function NewStudentButton({
  isPro,
  currentCount,
  limit,
  variant = "default",
  size = "default",
  fullWidth = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const limitReached = currentCount >= limit;

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
              ? `Você já tem ${limit} perfis (máximo do plano Pro).`
              : `Plano Free permite ${limit} perfil. Faça upgrade pra criar mais.`
            : undefined
        }
      >
        <Plus className="mr-2 size-4" aria-hidden />
        Novo perfil
      </Button>

      <StudentFormDialog
        open={open}
        onOpenChange={setOpen}
        isPro={isPro}
        currentCount={currentCount}
      />
    </>
  );
}
