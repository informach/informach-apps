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
import { deleteTurmaAction } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turmaId: string;
  schoolName: string;
};

export function DeleteTurmaDialog({ open, onOpenChange, turmaId, schoolName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleConfirm = (event: React.MouseEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await catchActionResult(() => deleteTurmaAction({ turmaId }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível apagar a turma.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "TURMA_NOT_FOUND") {
          toast.error("Turma já não existe", {
            description: "Pode ter sido removida em outra aba.",
          });
        } else if (result.error.code === "FORBIDDEN") {
          toast.error("Só quem criou a turma pode apagar.");
        } else if (result.error.code === "HAS_OTHER_MEMBERS") {
          toast.error("Outras famílias estão usando essa turma.", {
            description: "Peça para elas saírem antes de apagar, ou crie outra turma.",
          });
        } else if (result.error.code === "HAS_ACTIVITIES") {
          toast.error("Turma já tem atividades cadastradas.", {
            description: "Apague as atividades primeiro.",
          });
        } else {
          toast.error("Não foi possível apagar a turma.", {
            description: "Tente novamente em instantes.",
          });
          return;
        }
        onOpenChange(false);
        router.refresh();
        return;
      }
      toast.success("Turma apagada");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar turma?</AlertDialogTitle>
          <AlertDialogDescription>
            A turma de &quot;{schoolName}&quot; e todas as matérias dela serão removidas
            permanentemente. Só é possível apagar enquanto a turma estiver vazia, sem atividades
            cadastradas e sem outras famílias vinculadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={pending}>
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            Apagar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
