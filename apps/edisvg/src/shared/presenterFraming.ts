/**
 * The presenter's place in a lecture animation ("Aula teórica com a apresentadora"): the teacher
 * is recorded on a green screen and goes into the lesson in EdiAula, over the animation, which
 * keeps her side of the frame free. Where she stands changes along the explanation, as camera
 * shots cut between sentences.
 *
 * The shots, the guides and the content columns are the ones the person approved, adjustment by
 * adjustment, on the first lesson made with this recipe ("Transformando o vilão em aliado", aula 1
 * parte 1, 19/11/2026): only medium shots (waist up) and medium close-ups (chest up), always on one
 * side and never in the centre, the top of her video on the top of the frame; the content
 * centred in the free column between the guides, and a warm light behind her that follows the cuts.
 *
 * A placement is in EdiAula's terms, so the person sets the same numbers on the presenter's clip
 * there: x and y are the centre of the whole video as fractions of the frame, and scale 1 fits the
 * video in the frame (contained).
 */

export interface PresenterPlacement {
  id: "medium-right" | "medium-left" | "close-right" | "close-left";
  label: string;
  /** When it suits the explanation, for the assistant that picks the shots. */
  use: string;
  /** The side of the frame she is on (the content goes on the other). */
  side: "right" | "left";
  x: number;
  y: number;
  scale: number;
  /** The light behind her: a circle of radius LIGHT_RADIUS at (x, y), scaled. */
  light: { x: number; y: number; scale: number };
}

/** The lecture's frame, the lesson frame in EdiAula (the run's artboard). */
export const LECTURE_FRAME = { width: 1920, height: 1080 } as const;

/**
 * The guides of the lecture's artboard: the margins and the middle line. The content of a moment
 * stays between them, in the column away from her.
 */
export const LECTURE_GUIDES = {
  left: 84,
  center: 960,
  right: 1836,
  top: 92,
  bottom: 1008,
} as const;

/** Radius of the light behind her (the scale of each placement applies to it). */
export const LIGHT_RADIUS = 520;

/** Her centre, in pixels of the frame, for a placement on `side` at `scale`, top on top. */
const shot = (
  id: PresenterPlacement["id"],
  label: string,
  use: string,
  side: "right" | "left",
  scale: number,
  centerX: number,
  light: { x: number; y: number; scale: number },
): PresenterPlacement => ({
  id,
  label,
  use,
  side,
  x: centerX / LECTURE_FRAME.width,
  // The top of the video on the top of the frame: its centre is half its height down.
  y: scale / 2,
  scale,
  light,
});

export const PRESENTER_PLACEMENTS: readonly PresenterPlacement[] = [
  shot(
    "medium-right",
    "Médio à direita",
    "plano padrão da explicação (da cintura para cima), com o conteúdo à esquerda",
    "right",
    1.8,
    1480,
    { x: 1486, y: 560, scale: 1.2 },
  ),
  shot(
    "medium-left",
    "Médio à esquerda",
    "plano padrão da explicação (da cintura para cima), com o conteúdo à direita",
    "left",
    1.8,
    440,
    { x: 446, y: 560, scale: 1.2 },
  ),
  shot(
    "close-right",
    "Médio curto à direita",
    'fala direta com quem assiste (do peito para cima): cumprimento, apresentação, pergunta ("E você?"), pedido ("Fica comigo"), frase de efeito',
    "right",
    2.3,
    1500,
    { x: 1506, y: 520, scale: 1.5 },
  ),
  shot(
    "close-left",
    "Médio curto à esquerda",
    "fala direta com quem assiste, do lado esquerdo",
    "left",
    2.3,
    420,
    { x: 426, y: 520, scale: 1.5 },
  ),
];

/**
 * The column the content of a moment goes in while she is on `side`: between the margin guide
 * and the middle guide on the other side, its block centred in it (across and down).
 */
export function contentColumn(side: "right" | "left"): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
} {
  const g = LECTURE_GUIDES;
  const [left, right] = side === "right" ? [g.left, g.center] : [g.center, g.right];
  return {
    left,
    right,
    top: g.top,
    bottom: g.bottom,
    centerX: Math.round((left + right) / 2),
    centerY: Math.round((g.top + g.bottom) / 2),
  };
}

export type PlacementId = PresenterPlacement["id"];

export const placementOf = (id: PlacementId): PresenterPlacement => {
  const found = PRESENTER_PLACEMENTS.find((p) => p.id === id);
  if (!found) throw new Error(`Posição da apresentadora desconhecida: ${id}.`);
  return found;
};

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the person is in the video, as fractions of its width and height. */
export interface PersonBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The video's size on the artboard at scale 1 (fitted, as EdiAula fits it). */
export function fittedVideo(video: Size, board: Size): Size {
  if (!(video.width > 0 && video.height > 0 && board.width > 0 && board.height > 0))
    throw new Error("Tamanho de vídeo ou de prancheta inválido.");
  const fit = Math.min(board.width / video.width, board.height / video.height);
  return { width: video.width * fit, height: video.height * fit };
}

/** The whole video's rectangle on the artboard in a placement (it may go past the edges). */
export function placementBox(placement: PresenterPlacement, video: Size, board: Size): Box {
  const base = fittedVideo(video, board);
  const width = base.width * placement.scale;
  const height = base.height * placement.scale;
  return {
    x: placement.x * board.width - width / 2,
    y: placement.y * board.height - height / 2,
    width,
    height,
  };
}

/** The person's rectangle on the artboard in a placement, inside the artboard (null: off it). */
export function personBox(
  placement: PresenterPlacement,
  video: Size,
  board: Size,
  person: PersonBounds,
): Box | null {
  const box = placementBox(placement, video, board);
  const left = Math.max(0, box.x + person.left * box.width);
  const top = Math.max(0, box.y + person.top * box.height);
  const right = Math.min(board.width, box.x + person.right * box.width);
  const bottom = Math.min(board.height, box.y + person.bottom * box.height);
  if (right - left < 1 || bottom - top < 1) return null;
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

/** The pieces a run puts in the lecture's artboard before the draft (editor addPresenterStage). */
export interface PresenterStage {
  /** Her spot: locked, no paint, keyed at each shot. */
  slotId: string;
  /** The background rectangle, in the ink of the palette. */
  backgroundId: string;
  /** The light behind her, in the accent, keyed at each shot. */
  lightId: string;
}

/**
 * The light behind her: a radial glow of `color`, strong in the middle and gone at the edge (the
 * one of the approved lesson), as the fill of a circle.
 */
export const lightGradient = (color: string) => ({
  fill: {
    kind: "radial",
    units: "objectBoundingBox",
    spread: "pad",
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
    fx: 0.5,
    fy: 0.5,
    stops: [
      { offset: 0, color, opacity: 0.42 },
      { offset: 0.55, color, opacity: 0.16 },
      { offset: 1, color, opacity: 0 },
    ],
  },
});

/** A shot of the plan: from this frame of the animation on, the presenter in this placement. */
export interface Shot {
  from: number;
  /** Frame where the next shot starts (the animation's end for the last). */
  to: number;
  placement: PlacementId;
  /** Sentences (0-based) said in it. */
  lines: number[];
}

/** A shot shorter than this many seconds is joined to the one before (no flicker of cuts). */
export const MIN_SHOT_SECONDS = 3;

/**
 * The shots of the animation from one placement per sentence: a cut halfway through the pause
 * before the sentence whose placement changes (the first shot starts at frame 0). A shot shorter
 * than MIN_SHOT_SECONDS goes on in the placement of the one before (the first, the one after).
 */
export function planShots(
  lines: readonly { from: number; to: number }[],
  placements: readonly PlacementId[],
  fps: number,
  frames: number,
): Shot[] {
  if (!lines.length || lines.length !== placements.length)
    throw new Error("O plano precisa de uma posição por frase.");
  const cutBefore = (index: number): number => {
    if (index === 0) return 0;
    const previous = lines[index - 1];
    const line = lines[index];
    if (!previous || !line) return 0;
    return Math.max(0, Math.round((previous.to + line.from) / 2));
  };
  let shots: Shot[] = [];
  for (const [index, placement] of placements.entries()) {
    const last = shots.at(-1);
    if (last && last.placement === placement) last.lines.push(index);
    else shots.push({ from: cutBefore(index), to: frames, placement, lines: [index] });
  }
  const close = (list: Shot[]) =>
    list.map((shot, i) => ({ ...shot, to: list[i + 1]?.from ?? frames }));
  shots = close(shots);
  const min = MIN_SHOT_SECONDS * fps;
  // The shortest first: joining it may leave its neighbour long enough.
  for (;;) {
    const short = shots
      .map((shot, index) => ({ index, length: shot.to - shot.from }))
      .filter((s) => s.length < min && shots.length > 1)
      .sort((a, b) => a.length - b.length)[0];
    if (!short) break;
    const i = short.index;
    const shot = shots[i];
    if (!shot) break;
    const into = i > 0 ? i - 1 : i + 1;
    const target = shots[into];
    if (!target) break;
    const merged: Shot = {
      from: Math.min(target.from, shot.from),
      to: Math.max(target.to, shot.to),
      placement: target.placement,
      lines: [...target.lines, ...shot.lines].sort((a, b) => a - b),
    };
    shots = shots.flatMap((s, j) => (j === into ? [merged] : j === i ? [] : [s]));
    // Two neighbours left in the same placement are one shot.
    shots = shots.reduce<Shot[]>((out, s) => {
      const prev = out.at(-1);
      if (prev && prev.placement === s.placement)
        out[out.length - 1] = { ...prev, to: s.to, lines: [...prev.lines, ...s.lines] };
      else out.push(s);
      return out;
    }, []);
  }
  return close(shots);
}

/**
 * The placement of each sentence in the assistant's answer: a JSON {"posicoes": [...]} with one
 * placement id (or its name) per sentence, alone or in a code block. Throws a message for
 * the person otherwise.
 */
export function parsePlacements(text: string, count: number): PlacementId[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("O assistente não devolveu as posições da apresentadora.");
  }
  const list = (raw as { posicoes?: unknown } | null)?.posicoes;
  if (!Array.isArray(list) || list.length !== count)
    throw new Error(
      `O assistente devolveu ${Array.isArray(list) ? list.length : 0} posições da apresentadora para ${count} ${count === 1 ? "frase" : "frases"}.`,
    );
  const simple = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  return list.map((value, index) => {
    const found =
      typeof value === "string"
        ? PRESENTER_PLACEMENTS.find(
            (p) => p.id === value.trim() || simple(p.label) === simple(value),
          )
        : undefined;
    if (!found)
      throw new Error(
        `Posição da apresentadora desconhecida na frase ${index + 1}: ${String(value)}.`,
      );
    return found.id;
  });
}

/** Seconds as minutes and seconds with a tenth ("1:05.3"). */
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * The shots as the person sets them on the presenter's clip in EdiAula: each from the second of
 * the presenter's video where it starts (`videoStart` is the video second of frame 0).
 */
export function shotsReport(shots: readonly Shot[], fps: number, videoStart: number): string[] {
  return shots.map((shot) => {
    const p = placementOf(shot.placement);
    const n = (v: number) => Math.round(v * 1000) / 1000;
    return `${clock(videoStart + shot.from / fps)}–${clock(videoStart + shot.to / fps)} do vídeo: ${p.label} (x ${n(p.x)}, y ${n(p.y)}, escala ${p.scale})`;
  });
}
