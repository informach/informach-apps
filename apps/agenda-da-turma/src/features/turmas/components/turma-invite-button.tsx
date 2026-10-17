"use client";

import { Button } from "@informach/ui/components/button";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { Share2 } from "lucide-react";
import { shareTurmaInvite } from "../share-invite";

/** "Convidar": o link da turma para mandar no grupo das famílias. */
export function TurmaInviteButton({ code, label }: { code: string; label: string }) {
  // Só age por JS: antes de hidratar, o toque sumiria sem nada acontecer.
  const hydrated = useHydrated();
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 shrink-0 rounded-xl font-bold"
      disabled={!hydrated}
      aria-label={`Convidar famílias para a turma ${label}`}
      onClick={() => void shareTurmaInvite({ code, label })}
    >
      <Share2 className="size-4" aria-hidden />
      Convidar
    </Button>
  );
}
