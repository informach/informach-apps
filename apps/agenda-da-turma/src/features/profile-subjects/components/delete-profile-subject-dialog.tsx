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
import { deleteProfileSubjectAction } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
  pendingActivitiesCount: number;
};

export function DeleteProfileSubjectDialog({
  open,
  onOpenChange,
  subjectId,
  subjectName,
  pendingActivitiesCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleConfirm = (event: React.MouseEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await catchActionResult(() => deleteProfileSubjectAction({ id: subjectId }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível excluir.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "NOT_FOUND") {
          toast.error("Matéria já não existe");
        } else {
          toast.error("Não foi possível excluir.", {
            description: "Tente novamente em instantes.",
          });
          return;
        }
      } else {
        toast.success("Matéria excluída");
      }
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir matéria?</AlertDialogTitle>
          <AlertDialogDescription>
            A matéria &quot;{subjectName}&quot; será removida permanentemente.
            {pendingActivitiesCount > 0 ? (
              <>
                {" "}
                Todas as {pendingActivitiesCount}{" "}
                {pendingActivitiesCount === 1
                  ? "atividade pendente vinculada será excluída junto"
                  : "atividades pendentes vinculadas serão excluídas junto"}
                . Se a criança só vai dar uma pausa, use Pausar em vez de excluir.
              </>
            ) : null}
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
