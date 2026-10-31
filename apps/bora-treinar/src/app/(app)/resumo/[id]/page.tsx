import { notFound } from "next/navigation";
import { canUseProgression } from "@/features/acesso/policy";
import { CONQUISTAS } from "@/features/conquistas/catalogo";
import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { achievementsOf, sessionById, sessionsOf } from "@/features/sessoes/repository";
import { chainOf } from "@/features/treino/catalog/catalog";
import { pendingSuggestions } from "@/features/treino/engine/progression";
import { newRecords } from "@/features/treino/engine/stats";
import { SummaryScreen } from "@/features/treino/telas/resumo";

export const metadata = { title: "Resumo do treino" };

export default async function Resumo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, access, profiles } = await requireTrainer();
  const session = await sessionById(user.id, id);
  if (!session || !profiles.some((p) => p.id === session.profileId)) notFound();
  const [history, progress, earned] = await Promise.all([
    sessionsOf(session.profileId, { since: undefined }),
    progressOf(session.profileId),
    achievementsOf(session.profileId),
  ]);
  const previous = history.filter((s) => s.startedAt < session.startedAt);
  const chainsInSession = new Set(
    session.logs.flatMap((l) => {
      const chain = chainOf(l.exerciseId);
      return chain ? [chain.id] : [];
    }),
  );
  const isLatest = history.at(-1)?.id === session.id;
  return (
    <SummaryScreen
      profileId={session.profileId}
      session={session}
      records={newRecords(previous, session.logs)}
      suggestions={
        isLatest ? pendingSuggestions(progress).filter((s) => chainsInSession.has(s.chainId)) : []
      }
      achievements={earned
        .filter((a) => a.sessionId === session.id)
        .flatMap((a) => CONQUISTAS.filter((c) => c.id === a.achievementId))}
      progressionAllowed={canUseProgression(access)}
    />
  );
}
