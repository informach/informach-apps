/**
 * Recording scripts ("roteiros") pasted as Markdown, in the format used by the Sistema Zero
 * courses: sections with a video id and a target duration, "Na tela" directions (not narration),
 * speaker blocks with quoted lines (Professora, Debinha (avatar)…), insert ids such as F1P4-D01,
 * platform texts that are never recorded ("não gravar") and production notes.
 */

export interface ScriptDoc {
  title: string;
  /** Paragraphs before the first section (production and editing rules). */
  notes: string[];
  /** Speaking rate used for the target durations, when the script states it. */
  wordsPerMinute?: number;
  sections: ScriptSection[];
}

export interface ScriptSection {
  /** "1", "2"… as written in the heading. */
  number: string;
  title: string;
  videoId?: string;
  videoTitle?: string;
  /** Target duration range in seconds. */
  target?: [number, number];
  targetText?: string;
  items: ScriptItem[];
}

export type ScriptItem =
  | {
      kind: "speech";
      speaker: string;
      /** Spoken by an avatar rendered separately (the presenter's video), so it is inserted over the lesson. */
      avatar: boolean;
      text: string;
      /** Insert id from a direction before it (F1P1-D01): avatar lines only. */
      insertId?: string;
    }
  | {
      kind: "screen";
      text: string;
      /** The first insert id the direction names. */
      insertId?: string;
      /** Every insert id it names, in order, when there are several. */
      insertIds?: string[];
    }
  | { kind: "bridge"; text: string }
  | { kind: "note"; label: string; text: string };

/** "**F1P1-D01** ·" opening a direction (left out of its text). */
const LEADING_ID = /^\*\*([A-Z]\d+P\d+-[A-Z]\d+)\*\*\s*[·:-]?\s*/;
/** Insert ids anywhere in a direction, bold or not. */
const INSERT_IDS = /\b[A-Z]\d+P\d+-[A-Z]\d+\b/g;
/** Insert ids in bold ("**F1P1-D01**"): the ones a direction that opens with one announces. */
const BOLD_IDS = /\*\*([A-Z]\d+P\d+-[A-Z]\d+)\*\*/g;
/** "**Professora:**" or "**Debinha (avatar):**" alone on a line. */
const SPEAKER = /^\*\*([^*:]+?)(?:\s*\(([^)]*)\))?:\*\*$/;
const plain = (s: string): string => s.replace(/\*\*/g, "").replace(/`/g, "").trim();
const unquote = (s: string): string =>
  s
    .trim()
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();

/** "80 a 100 segundos", "5 a 6 minutos", "30 segundos" → [min, max] seconds. */
export function parseTarget(text: string): [number, number] | undefined {
  const m =
    /(\d+(?:[.,]\d+)?)\s*(?:a|-|–|até)?\s*(\d+(?:[.,]\d+)?)?\s*(segundos?|s\b|minutos?|min\b)/i.exec(
      text,
    );
  if (!m) return undefined;
  const unit = /^min/i.test(m[3]) ? 60 : 1;
  const a = Number(m[1].replace(",", ".")) * unit;
  const b = m[2] ? Number(m[2].replace(",", ".")) * unit : a;
  return [Math.min(a, b), Math.max(a, b)];
}

export function parseScript(md: string): ScriptDoc {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const doc: ScriptDoc = { title: "", notes: [], sections: [] };
  let section: ScriptSection | null = null;
  let speaker: { name: string; avatar: boolean } | null = null;
  let quote: string[] = [];
  // Insert ids of the directions so far, each waiting for the next avatar line.
  let pendingInserts: string[] = [];
  // Ids already announced in the section: naming one again ("a mesma entrada de F1P1-D01") is a
  // reference back, not a new insert.
  let announced = new Set<string>();
  // A speaker marked "(avatar)" once is the avatar in every block.
  const avatars = new Set<string>();
  for (const raw of lines) {
    const m = SPEAKER.exec(raw.trim());
    if (m && /avatar/i.test(m[2] ?? "")) avatars.add(m[1].trim().toLowerCase());
  }

  const flushQuote = (): void => {
    if (!speaker || !quote.length) {
      quote = [];
      return;
    }
    // Blank quote lines (">") separate paragraphs; each paragraph is aligned on its own.
    const paragraphs = quote
      .join("\n")
      .split(/\n\s*\n/)
      .map((p) => unquote(p.replace(/\n/g, " ")))
      .filter(Boolean);
    for (const text of paragraphs) {
      const insertId = speaker.avatar ? pendingInserts.shift() : undefined;
      section?.items.push({
        kind: "speech",
        speaker: speaker.name,
        avatar: speaker.avatar,
        text,
        ...(insertId ? { insertId } : {}),
      });
    }
    quote = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith(">")) {
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();
    if (!line) continue;

    let m = /^#\s+(.+)$/.exec(line);
    if (m) {
      doc.title = plain(m[1]);
      continue;
    }
    m =
      /^##\s+(?:Seção|Secao|Parte|Cena)\s+([\w.]+)[.:]?\s*(.*)$/i.exec(line) ||
      /^##\s+()(.+)$/.exec(line);
    if (m) {
      section = {
        number: (m[1] || String(doc.sections.length + 1)).replace(/\.$/, ""),
        title: plain(m[2]),
        items: [],
      };
      doc.sections.push(section);
      speaker = null;
      pendingInserts = [];
      announced = new Set();
      continue;
    }
    m = /^###\s+(.+)$/.exec(line);
    if (m) {
      if (section) {
        const v = /`([^`]+)`\s*(?:·|-|–)?\s*(.*)$/.exec(m[1]);
        section.videoId = v?.[1];
        section.videoTitle = plain(v ? v[2] : m[1].replace(/^Vídeo\s*/i, ""));
      }
      continue;
    }
    // "**Professora:**" alone on a line opens a speaker block for the quotes that follow.
    m = SPEAKER.exec(line);
    if (m && section) {
      const name = m[1].trim();
      speaker = { name, avatar: /avatar/i.test(m[2] ?? "") || avatars.has(name.toLowerCase()) };
      continue;
    }
    m = /^\*\*([^*]+?):\*\*\s*(.*)$/.exec(line);
    if (m) {
      const label = m[1].trim();
      const text = m[2].trim();
      speaker = null;
      if (!section) {
        doc.notes.push(plain(line));
        continue;
      }
      if (/^dura[çc][ãa]o/i.test(label)) {
        section.targetText = plain(text);
        section.target = parseTarget(text);
      } else if (/^na tela/i.test(label)) {
        const lead = LEADING_ID.exec(text);
        // A direction opening with a bold id announces its bold ids; otherwise any id it names.
        const named = lead
          ? [...text.matchAll(BOLD_IDS)].map((x) => x[1])
          : [...text.matchAll(INSERT_IDS)].map((x) => x[0]);
        const ids = [...new Set(named)].filter((id) => !announced.has(id));
        for (const id of ids) announced.add(id);
        pendingInserts.push(...ids);
        section.items.push({
          kind: "screen",
          text: plain(lead ? text.slice(lead[0].length) : text),
          ...(ids.length ? { insertId: ids[0] } : {}),
          ...(ids.length > 1 ? { insertIds: ids } : {}),
        });
      } else if (/n[ãa]o gravar/i.test(label)) {
        section.items.push({ kind: "bridge", text: plain(text) });
      } else {
        section.items.push({ kind: "note", label: plain(label), text: plain(text) });
      }
      continue;
    }
    if (!section) doc.notes.push(plain(line.replace(/^[-*]\s+/, "")));
    else section.items.push({ kind: "note", label: "", text: plain(line.replace(/^[-*]\s+/, "")) });
  }
  flushQuote();

  const wpm = /(\d{2,3})\s*palavras por minuto/i.exec(md);
  if (wpm) doc.wordsPerMinute = Number(wpm[1]);
  return doc;
}

export type SpeechItem = Extract<ScriptItem, { kind: "speech" }>;

export const speechItems = (s: ScriptSection): SpeechItem[] =>
  s.items.filter((i): i is SpeechItem => i.kind === "speech");

export const countWords = (text: string): number =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Seconds the narration takes at the script's speaking rate (no gestures or pauses). */
export function speechSeconds(s: ScriptSection, wpm = 137): number {
  return (speechItems(s).reduce((n, i) => n + countWords(i.text), 0) / wpm) * 60;
}

export const sectionLabel = (s: ScriptSection): string =>
  `Seção ${s.number} · ${s.videoTitle || s.title}`;
