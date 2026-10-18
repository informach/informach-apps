import type { TimelineWord } from "./cleanup.ts";

/**
 * Captions drawn into the video ("legenda gravada"), built from the edited timeline words.
 * The export renders them with libass from buildAss(); the preview draws the same cues with
 * the same font, size and colors.
 */

export type CaptionLook = "box" | "outline" | "karaoke";

export interface CaptionStyle {
  look: CaptionLook;
  position: "bottom" | "middle" | "top";
  /** Font size as % of the frame height. */
  size: number;
  /** Typeface (bundled or installed in Windows); default Segoe UI. */
  font?: string;
  /** Karaoke color of the word being said (default lime; the palette's accent). */
  highlight?: string;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  look: "karaoke",
  position: "bottom",
  size: 5.2,
};
export const CAPTION_FONT = "Segoe UI";
export const CAPTION_HIGHLIGHT = "#C8F031";

export const CAPTION_LOOKS: { id: CaptionLook; label: string }[] = [
  { id: "karaoke", label: "Palavra acende" },
  { id: "outline", label: "Contorno" },
  { id: "box", label: "Caixa escura" },
];

export interface CueWord {
  text: string;
  start: number;
  end: number;
  /** Timeline word key (cleanup.ts), when the cue was built from the transcript. */
  key?: string;
}

/** The look of one caption, over the project's (Project.cueStyles). */
export interface CueStyle {
  position?: CaptionStyle["position"];
  /** Font size as % of the frame height. */
  size?: number;
  /** Text color ('#RRGGBB'); in "Palavra acende" it is the color of the words still to come. */
  color?: string;
}

export interface CueStyleEntry extends CueStyle {
  /** Key of the caption's first word. */
  key: string;
}

export interface Cue {
  start: number;
  end: number;
  lines: CueWord[][];
  /** Key of the first word: what forced breaks and styles refer to. */
  key?: string;
  style?: CueStyle;
}

/** Hand-made caption layout: forced breaks and per-caption looks, by word key. */
export interface CueLayout {
  breaks?: readonly string[];
  styles?: readonly CueStyleEntry[];
}

/** The cue layout of a project. */
export const cueLayout = (p: {
  captionBreaks?: string[];
  cueStyles?: CueStyleEntry[];
}): CueLayout => ({ breaks: p.captionBreaks, styles: p.cueStyles });

const endsSentence = (w: string): boolean => /[.!?…]["”)]?$/.test(w);

/**
 * Groups words into cues of up to `maxLines` lines of `maxChars`, breaking at long pauses and
 * after sentence ends, so each cue reads as a phrase. `layout` forces breaks before given words
 * and gives single cues their own look.
 */
export function buildCues(
  words: TimelineWord[],
  maxChars = 42,
  maxLines = 2,
  layout: CueLayout = {},
): Cue[] {
  const breaks = new Set(layout.breaks ?? []);
  const styles = new Map((layout.styles ?? []).map((s) => [s.key, s]));
  const cues: Cue[] = [];
  let lines: CueWord[][] = [[]];
  const lineLen = (l: CueWord[]): number => l.reduce((n, w) => n + w.text.length + 1, 0);
  const flush = (): void => {
    const all = lines.flat();
    if (all.length) {
      const cue: Cue = {
        start: all[0].start,
        end: all[all.length - 1].end,
        lines: lines.filter((l) => l.length),
      };
      const key = all[0].key;
      const entry = key ? styles.get(key) : undefined;
      if (key) cue.key = key;
      if (entry) {
        const { key: _first, ...style } = entry;
        cue.style = style;
      }
      cues.push(cue);
    }
    lines = [[]];
  };
  let capitalize = true;
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (prev && (w.start - prev.end > 0.7 || breaks.has(w.key))) flush();
    let text = w.text;
    if (capitalize) text = text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
    capitalize = endsSentence(w.text);
    let line = lines[lines.length - 1];
    if (line.length && lineLen(line) + text.length > maxChars) {
      if (lines.length >= maxLines) flush();
      else lines.push([]);
      line = lines[lines.length - 1];
    }
    line.push({ text, start: w.start, end: w.end, key: w.key });
    // A sentence that ends past the middle of a cue closes it.
    if (
      endsSentence(w.text) &&
      lines.flat().reduce((n, x) => n + x.text.length + 1, 0) > maxChars * 0.6
    )
      flush();
  });
  flush();
  // Keep each cue on screen a little after its last word, but never over the next one.
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    cues[i].end = Math.min(cues[i].end + 0.25, next ? next.start : Infinity);
  }
  return cues;
}

/** The cue on screen at `t`, if any. */
export const cueAt = (cues: Cue[], t: number): Cue | undefined =>
  cues.find((c) => t >= c.start && t < c.end);

const assTime = (s: number): string => {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

/** '#RRGGBB' → ASS &HAABBGGRR. */
const assColor = (hex: string, alpha = 0): string => {
  const h = hex.replace("#", "");
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};

/**
 * Spoken text as ASS dialogue: braces would open override blocks and a backslash before N, n or h
 * is a line break or a hard space ("C:\Nova" would split). A word joiner (U+2060, invisible)
 * after each backslash keeps it a plain character.
 */
export const escapeAss = (t: string): string => t.replace(/\\/g, "\\\u2060").replace(/[{}]/g, "");

/** '#RRGGBB' → the inline override form &HBBGGRR&. */
const assTagColor = (hex: string): string => {
  const h = hex.replace("#", "");
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
};

const ALIGN = { top: 8, middle: 5, bottom: 2 } as const;

/** Vertical position of the caption block, in frame pixels from its edge. */
export const captionMargin = (style: CaptionStyle, height: number, vertical: boolean): number =>
  Math.round(height * (style.position === "middle" ? 0 : vertical ? 0.2 : 0.07));

/** A key pill on the timeline (shortcut pressed while recording). */
export interface KeyOnScreen {
  start: number;
  end: number;
  label: string;
}

/** Key pills sit in the bottom-right corner, clear of the captions. */
export const KEY_STYLE = { size: 3.4, margin: 0.035 };

/** An ASS subtitle file drawing the cues with the chosen look (and key pills), for a width × height frame. */
export function buildAss(
  cues: Cue[],
  style: CaptionStyle,
  width: number,
  height: number,
  keys: KeyOnScreen[] = [],
): string {
  const vertical = height > width;
  const fontSize = (size: number): number =>
    Math.round((size / 100) * height * (vertical ? 0.62 : 1));
  const fs = fontSize(style.size);
  const outline = Math.max(2, Math.round(fs * 0.09));
  const align = ALIGN[style.position];
  const margin = captionMargin(style, height, vertical);
  const white = assColor("#FFFFFF");
  const black = assColor("#000000");
  const box = style.look === "box";
  // Karaoke: PrimaryColour is the spoken part, SecondaryColour the part still to come.
  const primary = style.look === "karaoke" ? assColor(style.highlight ?? CAPTION_HIGHLIGHT) : white;
  const secondary = white;
  const back = assColor("#000000", 0x50);
  const head = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Cap,${(style.font ?? CAPTION_FONT).replace(/,/g, " ")},${fs},${primary},${secondary},${box ? back : black},${back},-1,0,0,0,100,100,0,0,${box ? 3 : 1},${box ? Math.round(fs * 0.3) : outline},0,${align},${Math.round(width * 0.06)},${Math.round(width * 0.06)},${margin},1`,
    `Style: Key,${CAPTION_FONT},${Math.round((KEY_STYLE.size / 100) * height)},${white},${white},${assColor("#12140A", 0x18)},${back},-1,0,0,0,100,100,0,0,3,${Math.round((KEY_STYLE.size / 100) * height * 0.35)},0,3,${Math.round(height * KEY_STYLE.margin)},${Math.round(height * KEY_STYLE.margin)},${Math.round(height * KEY_STYLE.margin)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  /** Inline overrides and vertical margin of a cue with its own look (the preview does the same). */
  const overrides = (c: Cue): { tags: string; marginV: number } => {
    const own = c.style;
    if (!own) return { tags: "", marginV: 0 };
    let tags = "";
    let marginV = 0;
    if (own.position && own.position !== style.position) {
      tags += `\\an${ALIGN[own.position]}`;
      marginV = captionMargin({ ...style, position: own.position }, height, vertical);
    }
    if (own.size && own.size !== style.size) {
      const size = fontSize(own.size);
      const border = box ? Math.round(size * 0.3) : Math.max(2, Math.round(size * 0.09));
      tags += `\\fs${size}\\bord${border}`;
    }
    // Karaoke paints the words still to come with the secondary color.
    if (own.color) tags += `\\${style.look === "karaoke" ? 2 : 1}c${assTagColor(own.color)}`;
    return { tags: tags ? `{${tags}}` : "", marginV };
  };
  const events = cues.map((c) => {
    const words = c.lines.flat();
    const text = c.lines
      .map((line) =>
        line
          .map((w) => {
            if (style.look !== "karaoke") return escapeAss(w.text);
            // Each word lights up when it starts being said.
            const i = words.indexOf(w);
            const next = words[i + 1];
            const dur = Math.max(1, Math.round(((next ? next.start : c.end) - w.start) * 100));
            const lead = i === 0 ? Math.max(0, Math.round((w.start - c.start) * 100)) : 0;
            return `${lead ? `{\\k${lead}}` : ""}{\\k${dur}}${escapeAss(w.text)}`;
          })
          .join(" "),
      )
      .join("\\N");
    const { tags, marginV } = overrides(c);
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Cap,,0,0,${marginV},,${tags}${text}`;
  });
  const keyEvents = keys.map(
    (k) => `Dialogue: 1,${assTime(k.start)},${assTime(k.end)},Key,,0,0,0,,${escapeAss(k.label)}`,
  );
  return [...head, ...events, ...keyEvents, ""].join("\n");
}
