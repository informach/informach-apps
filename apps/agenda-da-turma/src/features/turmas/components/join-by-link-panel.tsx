"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { StudentProfile } from "@/features/students/types";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { joinTurmaByCodeAction } from "../actions";

/** Escolher a criança continua sendo um passo explícito: o link não escolhe por ninguém. */
export function JoinByLinkPanel({ code, profiles }: { code: string; profiles: StudentProfile[] }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <label htmlFor="join-link-profile" className="grid gap-2 text-sm font-medium">
        Quem entra nesta turma?
        <select
          id="join-link-profile"
          className="h-11 rounded-md border bg-background px-3"
          value={profileId}
          onChange={(event) => setProfileId(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        className="min-h-11"
        disabled={pending || !profileId}
        onClick={() =>
          startTransition(async () => {
            const result = await catchActionResult(() =>
              joinTurmaByCodeAction({ code, profileId }),
            );
            if (!result.ok) {
              if (isActionRejected(result.error))
                toast.error("Não foi possível entrar na turma.", {
                  description: "Atualize a página e tente novamente.",
                });
              else if (result.error.code === "TURMA_NOT_FOUND")
                toast.error("Convite não encontrado", {
                  description: "Confira o link com quem enviou.",
                });
              else toast.error("Não foi possível entrar na turma.");
              return;
            }
            toast.success("Pronto! Vocês entraram na turma.");
            router.push("/familia/turmas");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
        Entrar na turma
      </Button>
    </div>
  );
}
