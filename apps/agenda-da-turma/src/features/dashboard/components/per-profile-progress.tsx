import { Card, CardContent } from "@informach/ui/components/card";
import { Progress } from "@informach/ui/components/progress";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import type { DashboardProfileSummary } from "../types";

type Props = {
  profiles: DashboardProfileSummary[];
};

export function PerProfileProgress({ profiles }: Props) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Progresso por estudante
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {profiles.map((p) => (
          <ProfileProgressCard key={p.profileId} profile={p} />
        ))}
      </div>
    </section>
  );
}

function ProfileProgressCard({ profile }: { profile: DashboardProfileSummary }) {
  const summaryParts: string[] = [];
  if (profile.pending > 0) {
    summaryParts.push(profile.pending === 1 ? "1 pendente" : `${profile.pending} pendentes`);
  }
  if (profile.overdue > 0) {
    summaryParts.push(profile.overdue === 1 ? "1 atrasada" : `${profile.overdue} atrasadas`);
  }
  if (profile.totalAll > 0) {
    summaryParts.push(`${profile.progressPercent}% concluído`);
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(" · ") : "Nenhuma atividade ainda";

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <StudentAvatar name={profile.profileName} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold text-foreground">{profile.profileName}</span>
            {profile.overdue > 0 ? (
              <span className="shrink-0 text-xs font-medium text-destructive">!</span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{summary}</p>
          <Progress value={profile.totalAll === 0 ? 0 : profile.progressPercent} />
        </div>
      </CardContent>
    </Card>
  );
}
