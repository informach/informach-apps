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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { toast } from "@informach/ui/components/sonner";
import { Loader2, MoreVertical, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setNoticeStatusAction } from "@/features/notices/actions";
import { noticeErrorMessage } from "@/features/notices/messages";
import { catchActionResult, isActionRejected } from "@/lib/action-result";

/**
 * O "⋮" do detalhe, ao lado de Editar, como na prancha. Mora aqui o que antes
 * ficava no menu de três pontos de cada linha da lista: cancelar a atividade,
 * com a confirmação de sempre (ela sai da lista do que falta e para de gerar
 * lembretes; o histórico fica).
 */
export function ActivityMoreMenu({
  id,
  version,
  title,
}: {
  id: string;
  version: number;
  title: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  const cancel = (event: React.MouseEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await catchActionResult(() =>
        setNoticeStatusAction({ id, version, status: "canceled" }),
      );
      if (!result.ok) {
        toast.error(
          isActionRejected(result.error)
            ? "Não foi possível cancelar. Atualize a página e tente de novo."
            : noticeErrorMessage(result.error.code),
        );
        setConfirm(false);
        router.refresh();
        return;
      }
      toast.success("Atividade cancelada. O histórico continua aqui.");
      setConfirm(false);
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Mais ações"
            className="flex size-11 items-center justify-center rounded-xl outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreVertical className="size-5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="min-h-11 text-destructive-ink focus:text-destructive-ink"
            onSelect={() => setConfirm(true)}
          >
            <X className="mr-2 size-4" aria-hidden />
            Cancelar atividade
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela sai da lista do que falta e para de gerar lembretes. O histórico fica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={cancel} disabled={pending}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
