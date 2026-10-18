import { type Activity, activityRanges } from "@shared/activity";
import { buildItems, type ProposalItem } from "@shared/anchors";
import {
  analyze,
  audibleSilences,
  cutTargets,
  DEFAULT_CLEANUP,
  type Issue,
  type IssueKind,
  mergeRanges,
  protectedConflicts,
  type SpeechSources,
  type TimelineWord,
  timelineWords,
} from "@shared/cleanup";
import type { CleanupSettings, Project, Transcript } from "@shared/types";

/**
 * The automatic cleanup of a lesson, one way for everyone: the Transcrição panel, find_cleanup
 * and apply_cleanup of the AI and the "Limpar a aula" button all go through cleanupPlan(), with
 * the choices kept in the project (project.cleanup), so what the person chose to keep stays kept
 * whoever cleans. Pure: what it reads is loaded by lib/transcripts.ts (loadCleanupInputs).
 */

/** What the cleanup reads besides the project. */
export interface CleanupInputs {
  transcripts: ReadonlyMap<string, Transcript>;
  /** Sound envelopes of heard media without a transcript (SpeechSources). */
  envelopes?: SpeechSources["envelopes"];
  /** cursor.json of each screen recording, by asset id (any version). */
  cursors?: ReadonlyMap<string, unknown>;
  /** guided-run.json of each guided recording, by asset id. */
  guidedRuns?: ReadonlyMap<string, unknown>;
  /** Recordings whose cursor data could not be read: their screen activity is not seen. */
  unseen?: readonly string[];
}

export interface CleanupChoices {
  minSilence: number;
  keepPause: number;
  kinds: Record<IssueKind, boolean>;
  /** Suggestions the person chose to keep. */
  kept: ReadonlySet<string>;
  intentional?: readonly string[];
}

/** The project's cleanup choices, with the defaults for what it does not say. */
export function cleanupChoices(settings: CleanupSettings | undefined): CleanupChoices {
  return {
    minSilence: settings?.minSilence ?? DEFAULT_CLEANUP.minSilence,
    keepPause: settings?.keepPause ?? DEFAULT_CLEANUP.keepPause,
    kinds: {
      filler: settings?.kinds?.filler ?? true,
      silence: settings?.kinds?.silence ?? true,
      repeat: settings?.kinds?.repeat ?? true,
    },
    kept: new Set(settings?.kept ?? []),
    ...(settings?.intentional ? { intentional: settings.intentional } : {}),
  };
}

export interface CleanupPlan {
  words: TimelineWord[];
  issues: Issue[];
  /** Issues that will be cut: enabled kind, not kept, not over a protected passage. */
  active: Issue[];
  /** Seconds the active issues take out. */
  saved: number;
  /** What happens on screen: never cut as silence. */
  activity: Activity[];
  choices: CleanupChoices;
}

/** Only for one call (the AI's options); what is kept always comes from the project. */
export interface CleanupOverrides {
  minSilence?: number;
  kinds?: Partial<Record<IssueKind, boolean>>;
}

/** Timeline words, every suggestion and the ones that will be cut, for the project as it is. */
export function cleanupPlan(
  project: Project,
  inputs: CleanupInputs,
  overrides: CleanupOverrides = {},
): CleanupPlan {
  const base = cleanupChoices(project.cleanup);
  const choices: CleanupChoices = {
    ...base,
    minSilence: overrides.minSilence ?? base.minSilence,
    kinds: { ...base.kinds, ...overrides.kinds },
  };
  const words = timelineWords(project, inputs.transcripts);
  const activity = activityRanges(project, inputs.cursors ?? new Map(), inputs.guidedRuns);
  const issues = analyze(
    words,
    audibleSilences(project, { transcripts: inputs.transcripts, envelopes: inputs.envelopes }),
    {
      minSilence: choices.minSilence,
      keepPause: choices.keepPause,
      activity,
      ...(choices.intentional ? { intentional: choices.intentional } : {}),
    },
  );
  // Protected passages are never offered for automatic cutting.
  const active = issues.filter(
    (i) =>
      choices.kinds[i.kind] &&
      !choices.kept.has(i.id) &&
      !protectedConflicts(project, [[i.start, i.end]]).length,
  );
  // Repeats can contain pauses that are also flagged, so measure the merged ranges.
  let saved = 0;
  for (const [a, b] of mergeRanges(active.map((i) => [i.start, i.end]))) saved += b - a;
  return { words, issues, active, saved, activity, choices };
}

const seconds = (s: number): string => `${s.toFixed(1).replace(".", ",")} s`;

/** Why an issue is cut, in a few words for the proposal. */
export function issueReason(issue: Issue, words: TimelineWord[], keepPause: number): string {
  const byKey = new Map(words.map((w) => [w.key, w.text]));
  const said = issue.words.map((k) => byKey.get(k) ?? "").join(" ");
  if (issue.kind === "filler") return `vício de fala: "${said}"`;
  if (issue.kind === "repeat") return `repetição: "${said}"`;
  return `silêncio de ${seconds(issue.end - issue.start + keepPause)}`;
}

/**
 * The cuts of a plan as proposal items anchored in the media (shared/anchors.ts), each with its
 * words, so the person reviews them one by one in the proposal bar before anything is cut.
 */
export function cleanupItems(
  project: Project,
  plan: CleanupPlan,
  newId: () => string,
): ProposalItem[] {
  const targets = cutTargets(project);
  const byKey = new Map(plan.words.map((w) => [w.key, w.text]));
  return plan.active.flatMap((issue) =>
    buildItems(
      project,
      [issue.start, issue.end],
      targets,
      {
        reason: issueReason(issue, plan.words, plan.choices.keepPause),
        ...(issue.words.length
          ? {
              wordKeys: issue.words,
              text: issue.words.map((k) => byKey.get(k) ?? "").join(" "),
              near: issue.start,
            }
          : {}),
      },
      newId,
    ),
  );
}
