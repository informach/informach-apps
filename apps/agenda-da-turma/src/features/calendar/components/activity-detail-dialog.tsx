"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import type { TaskRow } from "@/features/unified-activities/task-repository";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  item: TaskRow | null;
  currentUserId: string;
};

/**
 * Vista rápida de uma atividade a partir do calendário.
 *
 * Eram três diálogos — um por origem — cada um com a sua alternância de
 * conclusão, os seus botões e os seus erros, todos duplicando o que o card e a
 * página de detalhe já faziam. Agora é o mesmo card das outras telas; quem
 * precisa de mais abre a atividade pelo título.
 */
export function ActivityDetailDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  item,
  currentUserId,
}: Props) {
  return (
    <Dialog open={open && item !== null} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle>{item.title}</DialogTitle>
              <DialogDescription>
                Atividade de {item.profileName}. Abra o título para ver a fonte, editar e conferir o
                histórico.
              </DialogDescription>
            </DialogHeader>
            <UnifiedActivityCard entry={{ key: item.id, item }} currentUserId={currentUserId} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
