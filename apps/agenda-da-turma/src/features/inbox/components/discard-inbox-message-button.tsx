"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { catchActionResult } from "@/lib/action-result";
import { discardInboxMessageAction } from "../actions";

/** Nem todo e-mail encaminhado vira atividade. Descartar não custa nada. */
export function DiscardInboxMessageButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
      aria-label={`Descartar ${label}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await catchActionResult(() => discardInboxMessageAction({ id }));
          if (!result.ok) {
            toast.error("Não foi possível descartar agora.");
            return;
          }
          router.refresh();
        })
      }
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}
