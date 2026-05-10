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
import { deleteSubjectAction } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
};

export function DeleteSubjectDialog({ open, onOpenChange, subjectId, subjectName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleConfirm = (event: React.MouseEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await catchActionResult(() => deleteSubjectAction({ id: subjectId }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível excluir.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "NOT_FOUND") {
          toast.error("Matéria já não existe", {
            description: "Pode ter sido removida em outra aba.",
          });
        } else if (result.error.code === "FORBIDDEN") {
          toast.error("Você não pode excluir matérias dessa turma.");
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
            Esta ação é permanente. A matéria &quot;{subjectName}&quot; será removida da turma para
            todas as famílias vinculadas.
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
