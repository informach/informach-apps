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
  /** "Substituições na edição kids": the lines a character says instead, in the kids edition. */
  substitutions?: Substitution[];
}

/**
 * One row of "Substituições na edição kids": in the kids edition the exact line `text`, said
 * between `before` and `after`, is the character's (its own video) instead of the teacher's.
 */
export interface Substitution {
  /** "video-a1-abertura-K1". */
  id: string;
  /** "Debinha", "Dedé". */
  character: string;
  /** Which time the line is said in the section (1 = the first), when it is said more than once. */
  occurrence: number;
  before: string;
  text: string;
  after: string;
  /** Voice directions of the line ("[curious]"), for the character's render. */
  tags: string;
}

/**
 * A "Na tela" split at the words of the speech it waits for ("No 'Olha aqui', tocar…"): each
 * piece shows while recording when the voice reaches `anchor`; a piece without an anchor (the
 * opening of the direction) shows from the start of the part.
 */
export interface ScreenCue {
  anchor?: string;
  text: string;
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
      /** The direction split at the spoken words it waits for (production scripts). */
      cues?: ScreenCue[];
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

/** "[curious]", "[upbeat, welcoming voice]": voice directions for the voice tool, never said. */
const VOICE_TAGS = /\[[^\]\n]*\]/g;
export const withoutVoiceTags = (s: string): string =>
  s.replace(VOICE_TAGS, " ").replace(/\s+/g, " ").trim();

/** A quoted spoken phrase inside a direction ('No "Olha aqui", tocar…'). */
const QUOTED = /["“]([^"”]+)["”]/;

/** Text as compared for a quoted phrase: lower case, no accents, single spaces. */
const foldText = (s: string): string =>
  ` ${s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;

/**
 * A "Na tela" split into the pieces each spoken phrase it quotes starts: a sentence that quotes
 * words of the speech (`spoken`, the section's lines) opens a piece at those words, the
 * sentences after it belong to it, and what comes before the first one is the opening, shown from
 * the start. A quote that is not said (a button's label: Clicar em "Cadastrar") anchors nothing.
 * Null when nothing it quotes is said (a plain direction, as in the earlier scripts).
 */
export function screenCues(text: string, spoken: string): ScreenCue[] | null {
  const said = foldText(spoken);
  const anchorOf = (sentence: string): string | undefined => {
    const quoted = QUOTED.exec(sentence)?.[1]?.trim();
    return quoted && foldText(quoted).trim() && said.includes(foldText(quoted))
      ? quoted
      : undefined;
  };
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ"“*])/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.some((s) => anchorOf(s))) return null;
  const cues: ScreenCue[] = [];
  for (const sentence of sentences) {
    const anchor = anchorOf(sentence);
    const last = cues.at(-1);
    if (anchor) cues.push({ anchor, text: sentence });
    else if (last) last.text = `${last.text} ${sentence}`;
    else cues.push({ text: sentence });
  }
  return cues;
}

/** A row of a Markdown table, its cells trimmed ("| a | b |" → ["a", "b"]). */
const tableCells = (line: string): string[] =>
  line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function parseScript(md: string): ScriptDoc {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const doc: ScriptDoc = { title: "", notes: [], sections: [] };
  let section: ScriptSection | null = null;
  /**
   * What the block after a label holds in the production scripts: "Fala para ElevenLabs:" opens
   * the teacher's speech (in a fenced block), "Substituições na edição kids:" the kids table.
   */
  let block: "speech" | "substitutions" | null = null;
  /** The lines of a fenced block (```text … ```) while it is open. */
  let fence: string[] | null = null;
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
    // A fenced block: the teacher's speech after "Fala para ElevenLabs:", one item per paragraph
    // without the voice directions; any other fenced block is not part of the lesson.
    if (fence) {
      if (!line.startsWith("```")) {
        fence.push(line);
        continue;
      }
      if (block === "speech" && section)
        for (const paragraph of fence.join("\n").split(/\n\s*\n/)) {
          const text = withoutVoiceTags(paragraph.replace(/\n/g, " "));
          if (text)
            section.items.push({ kind: "speech", speaker: "Professora", avatar: false, text });
        }
      fence = null;
      block = null;
      continue;
    }
    if (line.startsWith("```")) {
      flushQuote();
      fence = [];
      continue;
    }
    // The kids table: its rows, the header and the separator left out.
    if (block === "substitutions" && line.startsWith("|")) {
      const cells = tableCells(line);
      const id = plain(cells[0] ?? "");
      if (section && cells.length >= 5 && id && !/^id$/i.test(id) && !/^-+$/.test(id)) {
        section.substitutions = section.substitutions ?? [];
        section.substitutions.push({
          id,
          character: plain(cells[1] ?? ""),
          occurrence: Math.max(1, Number.parseInt(cells[2] ?? "1", 10) || 1),
          before: withoutVoiceTags(plain(cells[3] ?? "")),
          text: withoutVoiceTags(plain(cells[4] ?? "")),
          after: withoutVoiceTags(plain(cells[5] ?? "")),
          tags: plain(cells[6] ?? ""),
        });
      }
      continue;
    }
    if (line && !line.startsWith("|")) block = block === "substitutions" ? null : block;
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
    // Production scripts: "**Fala para ElevenLabs:**" and "**Substituições na edição kids:**"
    // alone on a line open the block below them (they are not speakers).
    m = /^\*\*([^*]+?):\*\*$/.exec(line);
    if (m && /^fala\b/i.test(m[1].trim())) {
      speaker = null;
      block = "speech";
      continue;
    }
    if (m && /^substitui/i.test(m[1].trim())) {
      speaker = null;
      block = "substitutions";
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
      } else if (/^clipe$/i.test(label) && plain(text)) {
        // "**Clipe:** `video-a1-abertura`": the part's video, as a "### `id`" heading names it.
        section.videoId ??= plain(text);
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

  // Each direction split at the words of its section's speech that it quotes (the speech comes
  // after the direction in production scripts, so this waits for the whole section).
  for (const s of doc.sections) {
    const spoken = speechItems(s)
      .map((i) => i.text)
      .join(" ");
    s.items = s.items.map((item) => {
      if (item.kind !== "screen") return item;
      const cues = screenCues(item.text, spoken);
      return cues ? { ...item, cues } : item;
    });
  }

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
