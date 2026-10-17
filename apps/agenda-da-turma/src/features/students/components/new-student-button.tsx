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
              ? `Já são ${limit} crianças, o máximo do Pro.`
              : `O plano grátis tem ${limit} criança. No Pro cabem até três.`
            : undefined
        }
      >
        <Plus className="mr-2 size-4" aria-hidden />
        Adicionar criança
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
