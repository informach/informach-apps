"use client";

import { Button } from "@informach/ui/components/button";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { DiscardNoticeDialog } from "./discard-notice-dialog";

/**
 * A saída do card "Falta conferir antes de salvar".
 *
 * O card é grudento de propósito (o crédito já foi gasto), mas grudento sem
 * saída vira uma dívida que a família não consegue quitar. Ilha cliente
 * mínima: a seção que a usa continua sendo server component.
 */
export function DiscardDraftButton({ noticeId, label }: { noticeId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Descartar o recado de ${label}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
      <DiscardNoticeDialog open={open} onOpenChange={setOpen} noticeId={noticeId} />
    </>
  );
}
