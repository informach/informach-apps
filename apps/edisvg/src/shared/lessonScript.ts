import { parseScript, sentencesOf, withoutVoiceTags } from "@informach/edi-speech/script";

/**
 * The script of a lesson from EdiAula (its section: one video), as the phrases a pipeline run
 * picks from. Each spoken sentence is one phrase; a "Na tela" direction goes, as an [annotation],
 * before the first phrase picked after it. The roteiro a run gets is the phrases picked, in the
 * script's order (pipelines.ts spokenScript then leaves the annotations out of the audio search).
 */

export type LessonScriptRow =
  | { kind: "phrase"; index: number; text: string; speaker: string }
  | { kind: "screen"; text: string };

export interface LessonScript {
  /** "Seção 3 · Limites da tela", or the lesson's title. */
  title: string;
  rows: LessonScriptRow[];
  /** How many phrases there are (the indexes of the rows go 0..phrases-1). */
  phrases: number;
}

/** The section of the lesson's script, or null when it has no spoken line. */
export function lessonScript(text: string, section = 0): LessonScript | null {
  const doc = parseScript(text);
  const part = doc.sections[section] ?? doc.sections[0];
  if (!part) return null;
  const rows: LessonScriptRow[] = [];
  let phrases = 0;
  for (const item of part.items) {
    if (item.kind === "screen") {
      const direction = item.text.replace(/\s+/g, " ").trim();
      if (direction) rows.push({ kind: "screen", text: direction });
    } else if (item.kind === "speech")
      for (const sentence of sentencesOf(withoutVoiceTags(item.text)))
        rows.push({ kind: "phrase", index: phrases++, text: sentence, speaker: item.speaker });
  }
  if (!phrases) return null;
  const heading = [part.number && `Seção ${part.number}`, part.title].filter(Boolean).join(" · ");
  return { title: heading || doc.title, rows, phrases };
}

/** The roteiro of the phrases picked: one per line, each direction before the first one after it. */
export function pickedScript(script: LessonScript, picked: ReadonlySet<number>): string {
  const out: string[] = [];
  let directions: string[] = [];
  for (const row of script.rows) {
    if (row.kind === "screen") {
      directions.push(row.text);
      continue;
    }
    if (!picked.has(row.index)) continue;
    // A bracket inside a direction would end the annotation early: kept as parentheses.
    const notes = directions.map((d) => `[Na tela: ${d.replace(/\[/g, "(").replace(/\]/g, ")")}]`);
    out.push([...notes, row.text].join(" "));
    directions = [];
  }
  return out.join("\n");
}
