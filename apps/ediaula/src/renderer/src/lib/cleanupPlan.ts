import {
  type Activity,
  activityRanges,
  type ScreenMotion,
  screenRecordings,
} from "@shared/activity";
import { buildItems, locateItem, type ProposalItem } from "@shared/anchors";
import {
  analyze,
  audibleClips,
  audibleSilences,
  avatarMedia,
  cutTargets,
  DEFAULT_CLEANUP,
  type Issue,
  type IssueKind,
  keptMatcher,
  mergeRanges,
  protectedConflicts,
  type SpeechSources,
  type TimelineWord,
  timelineWords,
} from "@shared/cleanup";
import { parseScript, type ScriptDoc } from "@shared/script";
import {
  alignSection,
  didacticPauses,
  hasPauseDirections,
  rankSections,
} from "@shared/scriptAlign";
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
  /**
   * Where each screen recording stands still, by asset id; null while it is being analyzed. A
   * screen recording missing here counts as not analyzed: none of its pauses are cut.
   */
  screens?: ReadonlyMap<string, ScreenMotion | null>;
  /** Recordings whose cursor data could not be read. */
  unseen?: readonly string[];
}

export interface CleanupChoices {
  minSilence: number;
  keepPause: number;
  kinds: Record<IssueKind, boolean>;
  /** Suggestions the person chose to keep (ids, as stored: see keptMatcher). */
  kept: readonly string[];
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
    kept: settings?.kept ?? [],
    ...(settings?.intentional ? { intentional: settings.intentional } : {}),
  };
}

/** What the cleanup cannot see, by asset id, so the person (and the AI) can check it. */
export interface BlindSpots {
  /** Videos without cursor data: clicks, drags, scrolling and typing there are not seen. */
  noCursor: string[];
  /** Cursor data that could not be read. */
  unreadable: string[];
  /** Heard media with no transcript and no sound envelope: all of it counts as speech. */
  noEnvelope: string[];
  /** Transcribed media nobody hears (muted, volume 0, under the presenter's own sound): left out. */
  inaudible: string[];
  /** Screen recordings not analyzed yet (or that failed): none of their pauses are cut. */
  screenPending: string[];
}

export interface CleanupPlan {
  words: TimelineWord[];
  issues: Issue[];
  /** Issues that will be cut: enabled kind, not kept, not over a protected passage. */
  active: Issue[];
  /** Ids of the issues the person kept (by id, or a pause by where it is in the media). */
  keptIds: ReadonlySet<string>;
  /** Issues left out because the voice cleanup already proposes them. */
  elsewhere: number;
  /** Seconds the active issues take out. */
  saved: number;
  /** What happens on screen: never cut as silence. */
  activity: Activity[];
  choices: CleanupChoices;
  blind: BlindSpots;
}

/** Only for one call (the AI's options); what is kept always comes from the project. */
export interface CleanupOverrides {
  /** Never below the person's own choice: the AI may only cut less. */
  minSilence?: number;
  kinds?: Partial<Record<IssueKind, boolean>>;
}

/** What the cleanup cannot see in this project. */
export function blindSpots(project: Project, inputs: CleanupInputs): BlindSpots {
  const used = new Set(project.clips.map((c) => c.assetId));
  const videoTracks = new Set(project.tracks.filter((t) => t.kind === "video").map((t) => t.id));
  const onScreen = new Set(
    project.clips.filter((c) => videoTracks.has(c.trackId)).map((c) => c.assetId),
  );
  const avatar = avatarMedia(project);
  const heard = new Set(audibleClips(project).map((c) => c.assetId));
  return {
    noCursor: project.assets
      .filter(
        (a) =>
          onScreen.has(a.id) &&
          a.kind === "video" &&
          !a.generated &&
          !avatar.has(a.id) &&
          a.recording?.role !== "camera" &&
          (!a.cursor || a.cursorMissing),
      )
      .map((a) => a.id),
    unreadable: [...(inputs.unseen ?? [])],
    noEnvelope: [...heard].filter(
      (id) => !inputs.transcripts.has(id) && !inputs.envelopes?.has(id),
    ),
    inaudible: [...inputs.transcripts.keys()].filter((id) => used.has(id) && !heard.has(id)),
    screenPending: screenRecordings(project)
      .filter((a) => !inputs.screens?.get(a.id))
      .map((a) => a.id),
  };
}

const docs = new Map<string, ScriptDoc>();
const sectionByTranscripts = new WeakMap<object, { text: string; index: number }>();

/**
 * Where the script asks for a pause ("pausar para a pessoa testar", "aguardar"): between the
 * lines around such a direction, as said on the timeline. The section is the person's choice,
 * or the one that matches the recording (worked out once per set of transcripts).
 */
function scriptPauses(
  project: Project,
  transcripts: ReadonlyMap<string, Transcript>,
  words: TimelineWord[],
): [number, number][] {
  const text = project.script?.text;
  if (!text || !words.length) return [];
  let doc = docs.get(text);
  if (!doc) {
    doc = parseScript(text);
    docs.clear();
    docs.set(text, doc);
  }
  let index = project.script?.section;
  if (index === undefined) {
    const known = sectionByTranscripts.get(transcripts);
    if (known?.text === text) index = known.index;
    else {
      index = rankSections(doc, words).index;
      sectionByTranscripts.set(transcripts, { text, index });
    }
  }
  const section = doc.sections[index];
  if (!section || !hasPauseDirections(section)) return [];
  return didacticPauses(section, alignSection(section, words));
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
    minSilence: Math.max(base.minSilence, overrides.minSilence ?? base.minSilence),
    kinds: { ...base.kinds, ...overrides.kinds },
  };
  const words = timelineWords(project, inputs.transcripts);
  // Screen recordings without an analysis count as moving all the way: nothing of them is cut.
  const screens = new Map<string, ScreenMotion | null>(
    screenRecordings(project).map((a) => [a.id, inputs.screens?.get(a.id) ?? null]),
  );
  const activity = activityRanges(project, inputs.cursors ?? new Map(), inputs.guidedRuns, screens);
  const issues = analyze(
    words,
    audibleSilences(project, { transcripts: inputs.transcripts, envelopes: inputs.envelopes }),
    {
      minSilence: choices.minSilence,
      keepPause: choices.keepPause,
      activity,
      thinking: scriptPauses(project, inputs.transcripts, words),
      ...(choices.intentional ? { intentional: choices.intentional } : {}),
    },
  );
  const kept = keptMatcher(project, choices.kept);
  const keptIds = new Set(issues.filter(kept).map((i) => i.id));
  // What the voice cleanup already proposes (or the person left out of it) is not offered twice.
  const voice = (project.proposals ?? []).filter((p) => p.by === "voz");
  const voiceIds = new Set(voice.flatMap((p) => p.items.flatMap((i) => i.issueId ?? [])));
  const voicePlaces = voice.flatMap((p) =>
    p.items.flatMap((item): [number, number][] => {
      const place = locateItem(project, item, words);
      return place ? [place] : [];
    }),
  );
  const proposedElsewhere = (i: Issue): boolean =>
    voiceIds.has(i.id) ||
    voicePlaces.some(([a, b]) => Math.min(b, i.end) - Math.max(a, i.start) > 0.05);
  let elsewhere = 0;
  const active = issues.filter((i) => {
    if (!choices.kinds[i.kind] || keptIds.has(i.id)) return false;
    // Protected passages are never offered for automatic cutting.
    if (protectedConflicts(project, [[i.start, i.end]]).length) return false;
    if (proposedElsewhere(i)) {
      elsewhere++;
      return false;
    }
    return true;
  });
  // Repeats can contain pauses that are also flagged, so measure the merged ranges.
  let saved = 0;
  for (const [a, b] of mergeRanges(active.map((i) => [i.start, i.end]))) saved += b - a;
  return {
    words,
    issues,
    active,
    keptIds,
    elsewhere,
    saved,
    activity,
    choices,
    blind: blindSpots(project, inputs),
  };
}

const seconds = (s: number): string => `${s.toFixed(1).replace(".", ",")} s`;

/** Why an issue is cut, in a few words for the proposal. */
export function issueReason(issue: Issue, words: TimelineWord[], keepPause: number): string {
  const byKey = new Map(words.map((w) => [w.key, w.text]));
  const said = issue.words.map((k) => byKey.get(k) ?? "").join(" ");
  if (issue.kind === "filler") return `vício de fala: "${said}"`;
  if (issue.kind === "repeat") return `repetição: "${said}"`;
  const [a, b] = issue.span ?? [issue.start - keepPause / 2, issue.end + keepPause / 2];
  return `silêncio de ${seconds(b - a)}, fica uma pausa de ${seconds(b - a - (issue.end - issue.start))}`;
}

/**
 * The cuts of a plan as proposal items anchored in the media (shared/anchors.ts), each with its
 * words and its issue id: the person reviews them one by one in the proposal bar before anything
 * is cut, and what they leave out there becomes kept (keepRejected, when the proposal is applied).
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
        issueId: issue.id,
        category: issue.kind,
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

/** Most kept suggestions a lesson remembers; the oldest go first. */
export const KEPT_LIMIT = 20000;

/** The project with the cleanup items the person left out of a proposal kept from now on. */
export function keepRejected(project: Project, items: readonly ProposalItem[]): Project {
  const ids = items.flatMap((i) => (i.status === "rejected" && i.issueId ? [i.issueId] : []));
  if (!ids.length) return project;
  const kept = project.cleanup?.kept ?? [];
  const next = [...kept, ...ids.filter((id) => !kept.includes(id))].slice(-KEPT_LIMIT);
  return { ...project, cleanup: { ...project.cleanup, kept: next } };
}
