type AttemptActivity = { skillId: string; createdAt: Date };
type FamilyActivity = {
  kind: "attempt" | "reflection" | "laboratory";
  label: string;
  createdAt: Date;
  detail?: string;
};

/** Activity is chronological, not a claim of independent learning. */
export function latestFamilyActivity(
  records: {
    evidence: AttemptActivity[];
    reflections: AttemptActivity[];
    laboratory: { title: string; date: string; status: string }[];
  },
  skillNames: Record<string, string>,
): FamilyActivity | undefined {
  const activities: FamilyActivity[] = [
    ...records.evidence.map((row) => ({
      kind: "attempt" as const,
      label: skillNames[row.skillId] ?? row.skillId,
      createdAt: row.createdAt,
    })),
    ...records.reflections.map((row) => ({
      kind: "reflection" as const,
      label: `Reflexão: ${skillNames[row.skillId] ?? row.skillId}`,
      createdAt: row.createdAt,
      detail: "Registrou uma reflexão para conversar sobre o que aprendeu.",
    })),
    ...records.laboratory.map((row) => ({
      kind: "laboratory" as const,
      label: `Laboratório: ${row.title}`,
      createdAt: new Date(row.date),
      detail: `${row.status}.`,
    })),
  ];
  return activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}
