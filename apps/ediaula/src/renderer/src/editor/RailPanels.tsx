import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { AVATAR_FADE, MOTIONS, type Motion } from "@shared/compose";
import { type LessonTemplate, TEMPLATES } from "@shared/templates";
import { adjacency, newId, projectDuration } from "@shared/timeline";
import {
  COLOR_SETS,
  DEFAULT_TRANSITION,
  isColorFx,
  previousClip,
  TRANSITIONS,
  type TransitionKind,
} from "@shared/transitions";
import type { Clip, Project, Track } from "@shared/types";
import {
  ArrowDownToLine,
  ArrowLeftFromLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  AudioLines,
  Blend,
  BookOpen,
  Captions,
  CircleDot,
  Clock,
  Columns3,
  Layers,
  LayoutTemplate,
  type LucideIcon,
  Moon,
  MoveDiagonal,
  Music,
  Palette,
  Plus,
  ScrollText,
  Shrink,
  Sparkles,
  SquareSplitHorizontal,
  Target,
  Trash2,
  Wand2,
  Zap,
  ZoomIn,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { importMedia } from "@/lib/importMedia";
import {
  addTemplate,
  defaultValues,
  TemplateBlockedError,
  templateStart,
  templateThumb,
} from "@/lib/templates";
import {
  makeTransition,
  paletteColors,
  selectJunction,
  setTransition,
  setTransitionColors,
  TRANSITION_DRAG,
} from "@/lib/transitions";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { type Commit, personCommit, useProject } from "@/state/project";
import { Button, Toggle } from "@/ui";
import { CaptionSettings } from "./CaptionSettings";
import { MotionPathSection, Slider } from "./ClipVisual";
import { CueList } from "./CueList";
import { FontPicker } from "./FontPicker";
import { PaletteSection } from "./PaletteEditor";
import { Swatches } from "./Swatches";
import { VoiceSection } from "./VoiceSection";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Blend;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="library rail-panel">
      <div className="lib-header">
        <h2>
          <Icon size={15} /> {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Templates */

function TemplateCard({
  t,
  open,
  onOpen,
}: {
  t: LessonTemplate;
  open: boolean;
  onOpen: () => void;
}): ReactNode {
  const [values, setValues] = useState(() => defaultValues(t));
  const [thumb, setThumb] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const time = usePlayback((s) => s.time);
  const project = useProject((s) => s.project);
  useEffect(() => {
    let alive = true;
    // Redrawn a moment after typing stops.
    const timer = setTimeout(
      () => void templateThumb(t, values).then((u) => alive && setThumb(u)),
      250,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [t, values]);
  const where =
    t.where === "start"
      ? "no começo (a aula anda para frente)"
      : t.where === "end"
        ? "depois do último clipe"
        : `no cursor (${clock(time)})`;
  const insert = async (): Promise<void> => {
    setBusy(true);
    let ids: string[] = [];
    try {
      ids = await addTemplate(t.id, values);
    } catch (err) {
      if (!(err instanceof TemplateBlockedError)) throw err;
      useApp.getState().toast(err.message, "error");
    } finally {
      setBusy(false);
    }
    if (ids.length) {
      const at = project ? templateStart(t, project) : 0;
      playback.seek(at + 0.01);
      useApp
        .getState()
        .toast(
          `${t.label}: ${ids.length} camadas inseridas. Clique em uma para editar o texto.`,
          "success",
        );
    }
  };
  return (
    <div className={`tpl-card ${open ? "is-open" : ""}`}>
      <button type="button" className="tpl-head" onClick={onOpen}>
        {thumb ? <img src={thumb} alt="" /> : <span className="tpl-thumb-empty" />}
        <span className="tpl-text">
          <strong>{t.label}</strong>
          <small className="muted">{t.description}</small>
        </span>
      </button>
      {open && (
        <div className="tpl-form">
          {t.fields.map((f) =>
            f.multiline ? (
              <label key={f.id} className="tpl-field">
                <span className="field-label">{f.label}</span>
                <textarea
                  className="input"
                  rows={f.id === "options" || f.id === "items" ? 4 : 2}
                  value={values[f.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                />
              </label>
            ) : (
              <label key={f.id} className="tpl-field">
                <span className="field-label">{f.label}</span>
                <input
                  className="input"
                  value={values[f.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                />
              </label>
            ),
          )}
          <FontPicker value={values.font} onChange={(font) => setValues({ ...values, font })} />
          <p className="muted tpl-where">
            {t.duration.toLocaleString("pt-BR")} s · entra {where}
          </p>
          <Button
            variant="primary"
            icon={Plus}
            disabled={busy || !project}
            onClick={() => void insert()}
          >
            {busy ? "Inserindo…" : "Inserir"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function TemplatesPanel(): ReactNode {
  const [open, setOpen] = useState<string | null>(TEMPLATES[0].id);
  return (
    <Panel title="Templates" icon={LayoutTemplate}>
      <PaletteSection />
      <p className="muted ann-hint">
        Cenas animadas prontas, preenchidas com o curso e o roteiro. Cada camada vira uma anotação:
        dá para mexer depois.
      </p>
      <div className="tpl-list">
        {TEMPLATES.map((t) => (
          <TemplateCard
            key={t.id}
            t={t}
            open={open === t.id}
            onOpen={() => setOpen(open === t.id ? null : t.id)}
          />
        ))}
      </div>
      <p className="muted ann-hint">
        <Sparkles size={12} /> Ou peça ao Assistente: “põe uma pergunta com 3 alternativas quando
        ela pergunta qual bloco usar”.
      </p>
    </Panel>
  );
}

/* -------------------------------------------------------------- Transitions */

const TRANSITION_ICONS: Record<TransitionKind, LucideIcon> = {
  dissolve: Blend,
  black: Moon,
  "wipe-right": ArrowRightToLine,
  "wipe-left": ArrowLeftToLine,
  "wipe-down": ArrowDownToLine,
  "wipe-up": ArrowUpToLine,
  "circle-open": CircleDot,
  "circle-close": Shrink,
  clock: Clock,
  slide: ArrowLeftFromLine,
  zoom: ZoomIn,
  page: BookOpen,
  fold: ScrollText,
  glitch: Zap,
  colorwipe: Palette,
  colorbars: Columns3,
  colorcircles: Target,
  colorpanels: Layers,
  colorsplit: SquareSplitHorizontal,
};

const GROUPS = ["Clássicas", "Formas", "Movimento", "Cores", "Efeitos"] as const;

/** Colors of a color transition: the lesson palette, ready-made sets, or each color by hand (2 to 5). */
function TransitionColors({ clipId, colors }: { clipId: string; colors: string[] }): ReactNode {
  const [slot, setSlot] = useState<number | null>(null);
  const palette = paletteColors();
  const same = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((c, i) => c.toUpperCase() === b[i].toUpperCase());
  const set = (next: string[]): void => {
    setTransitionColors(clipId, next);
  };
  const sets = [{ id: "palette", label: "Paleta da aula", colors: palette }, ...COLOR_SETS];
  const slots = colors.map((color, index) => ({
    color,
    index,
    id: ["front", "back-near", "back-middle", "back-far", "back-last"][index],
  }));
  return (
    <div className="tr-colors">
      <span className="field-label">Cores</span>
      <div className="chip-row">
        {sets.map((cs) => (
          <button
            type="button"
            key={cs.id}
            className={`chip color-set ${same(cs.colors, colors) ? "is-active" : ""}`}
            onClick={() => set(cs.colors)}
            title={cs.label}
          >
            <span className="color-set-dots">
              {withRenderKeys(cs.colors, (color) => color).map(({ key, value: c }) => (
                <i key={key} style={{ background: c }} />
              ))}
            </span>
            {cs.label}
          </button>
        ))}
      </div>
      <div className="tr-slots">
        {slots.map(({ color: c, index: i, id }) => (
          <button
            type="button"
            key={id}
            className={`color-dot ${slot === i ? "is-active" : ""}`}
            style={{ background: c }}
            title={`Cor ${i + 1} (${i === 0 ? "a da frente" : "atrás"}) · ${c}`}
            onClick={() => setSlot(slot === i ? null : i)}
          />
        ))}
        {colors.length < 5 && (
          <button
            type="button"
            className="chip"
            onClick={() => set([...colors, colors[colors.length - 1]])}
            title="Mais uma cor"
          >
            + cor
          </button>
        )}
        {colors.length > 2 && (
          <button
            type="button"
            className="chip"
            onClick={() => set(colors.slice(0, -1))}
            title="Uma cor a menos"
          >
            − cor
          </button>
        )}
      </div>
      {slot !== null && slot < colors.length && (
        <Swatches
          value={colors[slot]}
          extra={COLOR_SETS.flatMap((cs) => cs.colors).map((hex) => ({ hex, name: hex }))}
          onPick={(hex) => hex && set(colors.map((c, i) => (i === slot ? hex : c)))}
        />
      )}
    </div>
  );
}

/** Cuts between scenes: clips that start where another one ends on the same video track. */
function cutClips(p: Project): Clip[] {
  const pictures = new Set(p.assets.filter((a) => a.kind !== "audio").map((a) => a.id));
  const previous = adjacency(p.clips);
  return p.clips.filter((c) => pictures.has(c.assetId) && !c.annotation && previous.has(c.id));
}

export function TransitionsPanel(): ReactNode {
  const project = useProject((s) => s.project);
  const junction = useApp((s) => s.junction);
  const [chosen, setChosen] = useState<TransitionKind>("dissolve");
  const [duration, setDuration] = useState(DEFAULT_TRANSITION.duration);
  if (!project) return null;
  const cuts = cutClips(project);
  const withTr = cuts.filter((c) => c.transition).length;
  const cut = junction
    ? project.clips.find((c) => c.id === junction && previousClip(project.clips, c))
    : undefined;
  const before = cut && previousClip(project.clips, cut);
  const nameOf = (c: Clip): string =>
    project.assets.find((a) => a.id === c.assetId)?.name ?? "clipe";
  const current = cut?.transition;
  const pick = (kind: TransitionKind): void => {
    setChosen(kind);
    if (cut) setTransition(cut.id, kind, current?.duration ?? duration);
    else
      useApp
        .getState()
        .toast(
          "Clique num corte (◆) na timeline para escolher onde a transição entra, ou arraste a transição até ele.",
          "info",
        );
  };
  const applyAll = (kind: TransitionKind | null): void => {
    const ids = new Set(cuts.map((c) => c.id));
    useProject.getState().commit((q) => ({
      ...q,
      clips: q.clips.map((c) =>
        ids.has(c.id) ? { ...c, transition: kind ? makeTransition(kind, duration) : undefined } : c,
      ),
    }));
    useApp
      .getState()
      .toast(
        kind
          ? `Transição em ${ids.size} corte(s). Ctrl+Z desfaz.`
          : "Transições removidas de todos os cortes. Ctrl+Z desfaz.",
        "success",
      );
  };
  const chosenLabel = TRANSITIONS.find((t) => t.id === chosen)?.label ?? "";
  return (
    <Panel title="Transições" icon={Blend}>
      {cut && before ? (
        <div className="props-section junction-box">
          <div className="props-head">
            <h3>Corte em {clock(cut.start)}</h3>
            <button type="button" className="link-btn" onClick={() => selectJunction(null)}>
              Fechar
            </button>
          </div>
          <p className="props-hint muted">
            {nameOf(before)} → {nameOf(cut)}
          </p>
          <p className="props-hint">
            {current
              ? `Transição: ${TRANSITIONS.find((t) => t.id === current.kind)?.label}`
              : "Sem transição (corte seco)."}
          </p>
          {current && (
            <>
              <Slider
                label="Duração"
                value={current.duration}
                min={0.2}
                max={2}
                step={0.05}
                format={(v) => `${v.toFixed(1)} s`}
                onCommit={(v) => setTransition(cut.id, current.kind, v)}
              />
              {isColorFx(current.kind) && (
                <TransitionColors
                  clipId={cut.id}
                  colors={current.colors?.length ? current.colors : paletteColors()}
                />
              )}
              <Button variant="secondary" icon={Trash2} onClick={() => setTransition(cut.id, null)}>
                Remover transição
              </Button>
            </>
          )}
        </div>
      ) : (
        <p className="muted ann-hint">
          Clique num corte (◆) na timeline e escolha a transição, ou arraste uma transição até o
          corte.{" "}
          {cuts.length
            ? `Esta aula tem ${cuts.length} corte(s)${withTr ? `, ${withTr} com transição` : ""}.`
            : "Ainda não há cenas coladas."}
        </p>
      )}
      {GROUPS.map((group) => (
        <Fragment key={group}>
          <h3 className="ann-group">{group}</h3>
          <div className="ann-grid">
            {TRANSITIONS.filter((t) => t.group === group).map((t) => {
              const Icon = TRANSITION_ICONS[t.id];
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`ann-tile ${current?.kind === t.id ? "is-active" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TRANSITION_DRAG, t.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => pick(t.id)}
                  title={`${t.hint}. ${cut ? "Clique para usar neste corte." : "Arraste até um corte (◆) na timeline."}`}
                >
                  <span className="ann-icon" style={{ color: "var(--accent)" }}>
                    <Icon size={22} />
                  </span>
                  <strong>{t.label}</strong>
                  <small className="muted">{t.hint}</small>
                </button>
              );
            })}
          </div>
        </Fragment>
      ))}
      <div className="props-section all-cuts">
        <h3>Todos os cortes</h3>
        <p className="props-hint muted">
          Cuidado: vale para os {cuts.length} corte(s) da aula de uma vez.
        </p>
        <Slider
          label="Duração"
          value={duration}
          min={0.2}
          max={2}
          step={0.05}
          format={(v) => `${v.toFixed(1)} s`}
          onCommit={setDuration}
        />
        <Button size="sm" disabled={!cuts.length} onClick={() => applyAll(chosen)}>
          Aplicar “{chosenLabel}” em todos
        </Button>
        {withTr > 0 && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => applyAll(null)}>
            Remover todas ({withTr})
          </Button>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Motions */

export function MotionsPanel(): ReactNode {
  const project = useProject((s) => s.project);
  const selection = useProject((s) => s.selection);
  if (!project) return null;
  const video = new Set(project.tracks.filter((t) => t.kind === "video").map((t) => t.id));
  const selected = project.clips.filter((c) => selection.includes(c.id) && video.has(c.trackId));
  const targets = selected.length ? selected : project.clips.filter((c) => c.annotation);
  const label = selected.length
    ? `${selected.length} clipe(s) selecionado(s)`
    : `todas as anotações (${targets.length})`;
  const first = targets[0];
  const apply = (which: "enter" | "exit", m: Motion | null): void => {
    const ids = new Set(targets.map((c) => c.id));
    const key = which === "enter" ? "fadeIn" : "fadeOut";
    useProject.getState().commit((q) => ({
      ...q,
      clips: q.clips.map((c) =>
        !ids.has(c.id)
          ? c
          : m
            ? { ...c, [which]: m, [key]: c[key] || (m === "fade" ? AVATAR_FADE : 0.4) }
            : { ...c, [which]: undefined, [key]: undefined },
      ),
    }));
  };
  const current = (which: "enter" | "exit"): Motion | null | undefined => {
    if (!first) return undefined;
    const of = (c: Clip): Motion | null =>
      (which === "enter" ? c.fadeIn : c.fadeOut) ? (c[which] ?? "fade") : null;
    const m = of(first);
    return targets.every((c) => of(c) === m) ? m : undefined;
  };
  const row = (title: string, which: "enter" | "exit"): ReactNode => (
    <>
      <span className="field-label">{title}</span>
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${current(which) === null ? "is-active" : ""}`}
          disabled={!targets.length}
          onClick={() => apply(which, null)}
        >
          Nenhuma
        </button>
        {MOTIONS.map((m) => (
          <button
            type="button"
            key={m.id}
            className={`chip ${current(which) === m.id ? "is-active" : ""}`}
            disabled={!targets.length}
            onClick={() => apply(which, m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </>
  );
  return (
    <Panel title="Animações" icon={MoveDiagonal}>
      <p className="muted ann-hint">Como os clipes entram e saem. Vale para {label}.</p>
      <div className="props-section">
        {row("Entrada", "enter")}
        {row("Saída", "exit")}
      </div>
      {selected.length === 1 ? (
        <MotionPathSection clip={selected[0]} />
      ) : (
        <p className="muted ann-hint">
          <Wand2 size={12} /> Selecione um clipe só para fazê-lo deslizar pela tela (movimento por
          keyframes).
        </p>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------- Audio */

/** Puts a music file on its own music track from 0:00, repeated to the end of the lesson, low. */
export async function addMusic(
  path: string,
  commit: Commit = personCommit,
): Promise<string | null> {
  const [asset] = await importMedia([path]);
  const p = useProject.getState().project;
  if (!asset || !p || !asset.hasAudio || !asset.duration) return null;
  const end = projectDuration(p) || asset.duration;
  const track: Track = {
    id: newId("t"),
    kind: "audio",
    name: "Música",
    muted: false,
    hidden: false,
    locked: false,
    music: true,
  };
  const clips: Clip[] = [];
  for (let at = 0; at < end - 0.05; at += asset.duration)
    clips.push({
      id: newId("c"),
      assetId: asset.id,
      trackId: track.id,
      start: at,
      in: 0,
      duration: Math.min(asset.duration, end - at),
      volume: 0.35,
      fadeIn: at === 0 ? 1 : undefined,
      fadeOut: at + asset.duration >= end ? 2 : undefined,
    });
  commit((q) => ({ ...q, tracks: [...q.tracks, track], clips: [...q.clips, ...clips] }));
  return track.id;
}

export function setTrackMusic(
  trackId: string,
  music: boolean,
  commit: Commit = personCommit,
): void {
  commit((q) => ({
    ...q,
    tracks: q.tracks.map((t) => (t.id === trackId ? { ...t, music: music || undefined } : t)),
  }));
}

export function setDenoise(clipIds: string[], on: boolean, commit: Commit = personCommit): void {
  const ids = new Set(clipIds);
  commit((q) => ({
    ...q,
    clips: q.clips.map((c) => (ids.has(c.id) ? { ...c, denoise: on || undefined } : c)),
  }));
}

export function AudioPanel(): ReactNode {
  const project = useProject((s) => s.project);
  const selection = useProject((s) => s.selection);
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const sounding = project.clips.filter(
    (c) => assets.get(c.assetId)?.hasAudio && assets.get(c.assetId)?.kind !== "image",
  );
  const tracks = project.tracks.filter((t) => sounding.some((c) => c.trackId === t.id));
  const voices = sounding.filter((c) => !project.tracks.find((t) => t.id === c.trackId)?.music);
  const selected = voices.filter((c) => selection.includes(c.id));
  const targets = selected.length ? selected : voices;
  const denoised = targets.length > 0 && targets.every((c) => c.denoise);
  const music = async (): Promise<void> => {
    const paths = await window.api.pickMedia();
    const file = paths.find((p) => /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(p));
    if (!file) return;
    setBusy(true);
    const id = await addMusic(file);
    setBusy(false);
    if (id)
      useApp
        .getState()
        .toast(
          "Música na faixa “Música”, a 35% e abaixando sozinha quando alguém fala.",
          "success",
        );
  };
  return (
    <Panel title="Áudio" icon={AudioLines}>
      <VoiceSection />
      <div className="props-section">
        <h3>
          <Music size={13} /> Música de fundo
        </h3>
        <p className="props-hint muted">
          Fica baixinha embaixo da aula e abaixa mais enquanto alguém fala (pela transcrição). Ouça
          na prévia.
        </p>
        <Button icon={Plus} disabled={busy} onClick={() => void music()}>
          {busy ? "Importando…" : "Adicionar música…"}
        </Button>
        {tracks.map((t) => {
          const n = sounding.filter((c) => c.trackId === t.id).length;
          return (
            <div key={t.id} className="audio-track-row">
              <span>
                <strong>{t.name}</strong>
                <small className="muted"> · {n} clipe(s)</small>
              </span>
              <div className="audio-flag" title="Abaixa automaticamente quando alguém fala">
                <small className="muted">Música</small>
                <Toggle
                  on={!!t.music}
                  onChange={(v) => setTrackMusic(t.id, v)}
                  label={`${t.name} é música`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="props-section">
        <div className="props-head">
          <h3>Reduzir ruído</h3>
          <Toggle
            on={denoised}
            onChange={(v) =>
              setDenoise(
                targets.map((c) => c.id),
                v,
              )
            }
            label="Reduzir ruído"
          />
        </div>
        <p className="props-hint muted">
          Tira chiado, ventilador e zumbido constante{" "}
          {selected.length
            ? `dos ${selected.length} clipe(s) selecionado(s)`
            : `de todas as falas (${voices.length} clipe(s))`}
          . Aplicado na exportação.
        </p>
      </div>
      <div className="props-section">
        <h3>Volume final</h3>
        <p className="props-hint muted">
          A exportação nivela a aula em −14 LUFS (padrão do YouTube); a opção fica na janela de
          exportação. O volume de cada clipe fica em Propriedades.
        </p>
      </div>
    </Panel>
  );
}

/* ----------------------------------------------------------------- Captions */

export function CaptionsPanel(): ReactNode {
  const transcribed = useProject((s) =>
    s.project?.assets.some((a) => a.transcriptStatus === "ready"),
  );
  return (
    <Panel title="Legendas" icon={Captions}>
      <CaptionSettings />
      <p className="muted ann-hint">
        A legenda sai da transcrição já editada: o que foi cortado não aparece e as palavras
        corrigidas saem corrigidas. O arquivo .srt é gerado na exportação, separado.
      </p>
      <CueList />
      {!transcribed && (
        <Button icon={Captions} onClick={() => useApp.getState().set({ sideTab: "transcript" })}>
          Abrir transcrição
        </Button>
      )}
    </Panel>
  );
}
