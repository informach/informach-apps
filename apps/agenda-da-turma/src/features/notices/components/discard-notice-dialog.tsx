"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@informach/ui/components/alert-dialog";
import { toast } from "@informach/ui/components/sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { catchActionResult } from "@/lib/action-result";
import { discardNoticeAction } from "../actions";
import { noticeErrorMessage } from "../messages";

/**
 * Descarta um rascunho inteiro (recado `ready`).
 *
 * O texto diz a verdade sobre o dinheiro: o crédito, ou a importação de teste,
 * foi consumido quando a leitura ficou pronta e não volta. Diz também a saída:
 * importar o mesmo conteúdo de novo recupera a leitura sem nova cobrança.
 */
export function DiscardNoticeDialog({
  open,
  onOpenChange,
  noticeId,
  onDiscarded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noticeId: string;
  onDiscarded?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleConfirm = (event: React.MouseEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await catchActionResult(() => discardNoticeAction({ noticeId }));
      if (!result.ok) {
        toast.error(noticeErrorMessage(result.error.code));
        // Já salvo, já descartado ou sem acesso: a tela está velha.
        if (result.error.code === "NOT_DRAFT" || result.error.code === "NOT_FOUND") {
          onOpenChange(false);
          router.refresh();
        }
        return;
      }
      toast.success("Recado descartado.");
      onOpenChange(false);
      router.refresh();
      onDiscarded?.();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar esta importação?</AlertDialogTitle>
          <AlertDialogDescription>
            O crédito (ou a importação de teste) já foi usado quando a leitura ficou pronta e não
            volta. Se você enviar o mesmo recado de novo, a leitura é recuperada sem nova cobrança.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={pending}>
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            Descartar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
