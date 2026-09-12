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
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { deleteActivityAction } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityId: string;
  activityTitle: string;
};

export function DeleteActivityDialog({ open, onOpenChange, activityId, activityTitle }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleConfirm = (event: React.MouseEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await catchActionResult(() => deleteActivityAction({ id: activityId }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível excluir.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "NOT_FOUND") {
          toast.error("Atividade já não existe", {
            description: "Pode ter sido removida em outra aba.",
          });
        } else if (result.error.code === "FORBIDDEN") {
          toast.error("Só quem criou a atividade pode excluir.");
        } else {
          toast.error("Não foi possível excluir.", {
            description: "Tente novamente em instantes.",
          });
          return;
        }
      } else {
        toast.success("Atividade removida ou cancelada para as famílias que já aceitaram");
      }
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir atividade?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{activityTitle}&quot; será removida. Se outra família já aceitou, a atividade será
            marcada como cancelada, preservando o histórico de cada criança.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={pending}>
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
