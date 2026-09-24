"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { catchActionResult } from "@/lib/action-result";
import { dismissFirstStepsAction } from "../actions";

export function DismissFirstStepsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 shrink-0 text-muted-foreground"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await catchActionResult(() => dismissFirstStepsAction({}));
          if (!result.ok) {
            toast.error("Não foi possível dispensar agora.");
            return;
          }
          router.refresh();
        })
      }
    >
      Dispensar
    </Button>
  );
}
