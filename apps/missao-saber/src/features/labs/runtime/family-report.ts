import "server-only";
import { and, db, desc, eq, sql } from "@informach/db";
import { missaoProfiles as profiles, missaoLabExecutions as runs } from "@informach/db/schema";
import { findExperience } from "./catalog";

/** Parent history may retain earlier grades. It never grants access to a child's tool. */
export async function laboratoryReport(userId: string, profileId: string, since?: Date) {
  const latestEvent = sql`(select max((event->>'at')::timestamptz) from jsonb_array_elements(${runs.events}) as event)`;
  const rows = await db
    .select({ id: runs.id, experienceId: runs.experienceId, events: runs.events })
    .from(runs)
    .innerJoin(profiles, eq(runs.profileId, profiles.id))
    .where(
      and(
        eq(profiles.userId, userId),
        eq(profiles.id, profileId),
        since
          ? sql`${latestEvent} >= ${since.toISOString()}::timestamptz`
          : sql`${latestEvent} is not null`,
      ),
    )
    .orderBy(desc(latestEvent), desc(runs.id))
    .limit(5);
  return rows
    .flatMap((run) => {
      const event = [...run.events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
      if (!event) return [];
      const status =
        event.kind === "transfer_solved"
          ? "Conferiu corretamente um novo caso com o apoio do laboratório"
          : event.kind === "transfer_reflected"
            ? "Registrou uma reflexão em um novo caso; a rubrica pede conversa"
            : event.kind === "investigation_concluded"
              ? "Concluiu a investigação e a autoavaliação"
              : "Começou a explorar";
      return [
        {
          id: run.id,
          title: findExperience(run.experienceId)?.title ?? "Experiência anterior",
          status,
          summary: event.summary,
          date: event.at,
          next: "Peça que explique a relação e tente uma missão nova sem a ferramenta.",
        },
      ];
    })
    .slice(0, 5);
}
