"use client";
import { Card, CardContent } from "@informach/ui/components/card";
import { Users } from "lucide-react";
import { TurmaInviteButton } from "@/features/turmas/components/turma-invite-button";
import { SHEET_LINK } from "@/features/unified-activities/components/activity-list";
import type { StudentProfileWithActiveTurma } from "../types";
import { shortChildNames } from "../utils";
import { NewStudentButton } from "./new-student-button";
import { StudentCard } from "./student-card";

type Props = {
  profiles: StudentProfileWithActiveTurma[];
  extrasByProfile?: Record<string, string | null>;
  currentCount: number;
  limit: number;
  canActivate: boolean;
  accountHref: string;
  turmaInvites: Array<{ id: string; code: string; label: string }>;
};
export function StudentsSection({
  profiles,
  extrasByProfile = {},
  currentCount,
  limit,
  canActivate,
  accountHref,
  turmaInvites,
}: Props) {
  const shortNames = shortChildNames(profiles);
  return (
    <div className="space-y-3">
      {!profiles.length ? (
        <Card className="rounded-[20px] border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-6" aria-hidden />
            <p className="font-semibold">Nenhuma criança disponível nesta família</p>
            <p className="text-sm text-muted-foreground">
              As pessoas e as permissões são organizadas na Minha conta. Cada criança tem sua
              própria rotina na Agenda.
            </p>
          </CardContent>
        </Card>
      ) : (
        profiles.map((profile) => (
          <StudentCard
            key={profile.id}
            profile={profile}
            shortName={shortNames.get(profile.id) ?? profile.name}
            extras={extrasByProfile[profile.id] ?? null}
          />
        ))
      )}
      {canActivate ? (
        <NewStudentButton currentCount={currentCount} limit={limit} appearance="dashed" />
      ) : null}
      <section
        aria-labelledby="quem-cuida"
        className="space-y-2 rounded-[20px] border border-foreground/15 p-[18px]"
      >
        <h2 id="quem-cuida" className="text-[19px] font-bold">
          Quem cuida junto
        </h2>
        <p className="text-sm text-muted-foreground">
          Convide adultos e escolha o que cada um pode ver ou fazer para cada criança e aplicativo.
        </p>
        <a href={accountHref} className={SHEET_LINK}>
          Pessoas e permissões na Minha conta
        </a>
      </section>
      {turmaInvites.map((turma) => (
        <section
          key={turma.id}
          aria-labelledby={`turma-${turma.id}`}
          className="flex items-center gap-3 rounded-[20px] border border-foreground/15 px-[18px] py-4"
        >
          <div className="min-w-0 flex-1 text-[15px]">
            <h2 id={`turma-${turma.id}`} className="font-bold">
              Turma do {turma.label}
            </h2>
            <p className="text-muted-foreground">
              Convide outras famílias para receber as atividades compartilhadas.
            </p>
          </div>
          <TurmaInviteButton code={turma.code} label={turma.label} />
        </section>
      ))}
    </div>
  );
}
