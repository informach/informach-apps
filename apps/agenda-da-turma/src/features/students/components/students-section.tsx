"use client";

import { Card, CardContent } from "@informach/ui/components/card";
import { Users } from "lucide-react";
import type { StudentProfileWithActiveTurma } from "../types";
import { NewStudentButton } from "./new-student-button";
import { StudentCard } from "./student-card";

type Props = {
  profiles: StudentProfileWithActiveTurma[];
  isPro: boolean;
  currentCount: number;
  limit: number;
};

export function StudentsSection({ profiles, isPro, currentCount, limit }: Props) {
  if (currentCount === 0) {
    return (
      <div className="space-y-4">
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                Nenhum perfil de estudante ainda
              </p>
              <p className="text-sm text-muted-foreground">
                Crie um perfil para organizar a rotina de cada criança.
              </p>
            </div>
            <NewStudentButton isPro={isPro} currentCount={currentCount} limit={limit} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {currentCount} de {limit} {limit === 1 ? "perfil" : "perfis"}
          {!isPro ? " (plano Free)" : ""}
        </p>
        <NewStudentButton isPro={isPro} currentCount={currentCount} limit={limit} size="sm" />
      </div>

      <div className="space-y-3">
        {profiles.map((profile) => (
          <StudentCard
            key={profile.id}
            profile={profile}
            isPro={isPro}
            currentCount={currentCount}
          />
        ))}
      </div>
    </div>
  );
}
