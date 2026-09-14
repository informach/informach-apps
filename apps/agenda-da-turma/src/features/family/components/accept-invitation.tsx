"use client";
import { Button } from "@informach/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { catchActionResult } from "@/lib/action-result";
import { acceptFamilyAction } from "../actions";

export function AcceptInvitation({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Você está entrando com {email}. Ao aceitar, poderá acompanhar e atualizar as atividades das
        crianças autorizadas.
      </p>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await catchActionResult(() => acceptFamilyAction({ token }));
          setBusy(false);
          if (!result.ok) {
            setError(
              "O convite não está disponível. Ele pode ter expirado, sido revogado ou ser destinado a outro e-mail. Confirme também que seu e-mail está verificado.",
            );
            return;
          }
          router.replace("/dashboard");
          router.refresh();
        }}
      >
        {busy ? "Aceitando…" : "Aceitar convite"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
