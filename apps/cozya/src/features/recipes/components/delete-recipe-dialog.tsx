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
import { deleteRecipeAction } from "../actions";
import { catchActionResult, isActionRejected } from "./action-errors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  recipeName: string;
  /** Called after the recipe is gone, e.g. to leave its own page. */
  onDeleted?: () => void;
};

export function DeleteRecipeDialog({ open, onOpenChange, recipeId, recipeName, onDeleted }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleConfirm = (event: React.MouseEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await catchActionResult(() => deleteRecipeAction({ id: recipeId }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível apagar.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "NOT_FOUND") {
          toast.error("Receita já não existe", {
            description: "Pode ter sido removida em outra aba.",
          });
        } else {
          toast.error("Não foi possível apagar.", {
            description: "Tente novamente em instantes.",
          });
          return;
        }
      } else {
        toast.success("Receita apagada");
      }
      onOpenChange(false);
      if (onDeleted) onDeleted();
      else router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar esta receita?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{recipeName}&quot; sai do seu Cozya. As refeições já planejadas com ela continuam
            na semana, sem receita. Não dá para desfazer.
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
