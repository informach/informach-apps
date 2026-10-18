import { focusOnMount } from "@informach/edi-desktop/renderer";
import type { Annotation } from "@shared/annotation";
import { gainDbAt, upsertGain } from "@shared/gain";
import type { StyleTarget } from "@shared/library";
import {
  type Background,
  type ClipColor,
  DEVICES,
  type Device,
  NEUTRAL_TEMPERATURE,
  REGION_KINDS,
  type RegionFx,
  type RegionKind,
} from "@shared/look";
import { chaptersOf } from "@shared/markers";
import { followTarget, zoomUnder } from "@shared/regionFollow";
import { revealKind } from "@shared/reveal";
import { clipEnd } from "@shared/timeline";
import type { Asset, Clip } from "@shared/types";
import {
  Bookmark,
  Laptop,
  MapPin,
  Palette,
  ScanEye,
  Smartphone,
  SquareDashed,
  Unlink,
  Volume2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { actions } from "@/lib/actions";
import { updateAnnotation } from "@/lib/annotations";
import { timecode } from "@/lib/format";
import { favoriteStyle } from "@/lib/sharedLibrary";
import { playback, usePlayback } from "@/state/playback";
import { useProject, waitForDraft } from "@/state/project";
import { Button, Toggle } from "@/ui";
import { Slider, updateClip } from "./ClipVisual";
import { Swatches } from "./Swatches";

const signed = (v: number): string => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;
const times = (v: number): string => `${v.toFixed(2).replace(".", ",")}×`;

/** Brightness, contrast, saturation and temperature of a clip (shared/look.ts). */
export function ColorSection({ clip }: { clip: Clip }): ReactNode {
  const c = clip.color ?? {};
  const set = (changes: Partial<ClipColor>): void => {
    updateClip(clip.id, (x) => {
      const color = { ...x.color, ...changes };
      const clean: ClipColor = {};
      if ((color.brightness ?? 0) !== 0) clean.brightness = color.brightness;
      if ((color.contrast ?? 1) !== 1) clean.contrast = color.contrast;
      if ((color.saturation ?? 1) !== 1) clean.saturation = color.saturation;
      if ((color.temperature ?? NEUTRAL_TEMPERATURE) !== NEUTRAL_TEMPERATURE)
        clean.temperature = color.temperature;
      const { color: _old, ...rest } = x;
      return Object.keys(clean).length ? { ...rest, color: clean } : rest;
    });
  };
  return (
    <div className="props-section">
      <div className="props-head">
        <h3>
          <Palette size={13} /> Cor
        </h3>
        {clip.color && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              set({ brightness: 0, contrast: 1, saturation: 1, temperature: NEUTRAL_TEMPERATURE })
            }
          >
            Original
          </Button>
        )}
      </div>
      <Slider
        label="Brilho"
        value={c.brightness ?? 0}
        min={-0.5}
        max={0.5}
        step={0.01}
        format={signed}
        onCommit={(v) => set({ brightness: v })}
      />
      <Slider
        label="Contraste"
        value={c.contrast ?? 1}
        min={0.5}
        max={2}
        step={0.01}
        format={times}
        onCommit={(v) => set({ contrast: v })}
      />
      <Slider
        label="Saturação"
        value={c.saturation ?? 1}
        min={0}
        max={2.5}
        step={0.01}
        format={times}
        onCommit={(v) => set({ saturation: v })}
      />
      <Slider
        label="Temperatura"
        value={c.temperature ?? NEUTRAL_TEMPERATURE}
        min={2500}
        max={11000}
        step={100}
        format={(v) => (v === NEUTRAL_TEMPERATURE ? "neutra" : `${Math.round(v)} K`)}
        onCommit={(v) => set({ temperature: v })}
      />
      <p className="props-hint muted">Mais baixa esquenta (amarelo), mais alta esfria (azul).</p>
    </div>
  );
}

const DEVICE_LABEL: Record<Device, string> = { laptop: "Notebook", phone: "Celular" };
const DEVICE_ICON = { laptop: Laptop, phone: Smartphone };

/** The picture on the screen of a laptop or a phone drawn around it. */
export function DeviceSection({ clip }: { clip: Clip }): ReactNode {
  const current = clip.transform?.device;
  const set = (device: Device | undefined): void => {
    updateClip(clip.id, (x) => {
      const t = { ...(x.transform ?? { x: 0.5, y: 0.5, scale: 1, opacity: 1 }) };
      if (device) t.device = device;
      else delete t.device;
      return { ...x, transform: t };
    });
  };
  return (
    <div className="props-section">
      <h3>Moldura de dispositivo</h3>
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${!current ? "is-active" : ""}`}
          onClick={() => set(undefined)}
        >
          Sem
        </button>
        {DEVICES.map((d) => {
          const Icon = DEVICE_ICON[d];
          return (
            <button
              type="button"
              key={d}
              className={`chip ${current === d ? "is-active" : ""}`}
              onClick={() => set(d)}
            >
              <Icon size={12} /> {DEVICE_LABEL[d]}
            </button>
          );
        })}
      </div>
      {current && (
        <p className="props-hint muted">
          A moldura toma o lugar dos cantos arredondados e da borda; a sombra segue o contorno dela.
        </p>
      )}
    </div>
  );
}

const REGION_LABEL: Record<RegionKind, string> = {
  blur: "Desfoque",
  pixelate: "Pixelado",
  spotlight: "Holofote",
};

/** A region effect: what it does, how strong, how soft the edge (the box is moved on the preview). */
export function RegionSection({ clip, region: r }: { clip: Clip; region: RegionFx }): ReactNode {
  const project = useProject((s) => s.project);
  const set = (changes: Partial<RegionFx>): void => {
    updateClip(clip.id, (x) =>
      x.regionFx ? { ...x, regionFx: { ...x.regionFx, ...changes } } : x,
    );
  };
  const target = project ? followTarget(project, clip) : null;
  const zoomed = !!project && zoomUnder(project, clip);
  return (
    <div className="props-section">
      <h3>
        <ScanEye size={13} /> Efeito de região
      </h3>
      <div className="chip-row">
        {REGION_KINDS.map((k) => (
          <button
            type="button"
            key={k}
            className={`chip ${r.kind === k ? "is-active" : ""}`}
            onClick={() => set({ kind: k })}
          >
            {REGION_LABEL[k]}
          </button>
        ))}
      </div>
      <Slider
        label={
          r.kind === "spotlight"
            ? "Escurecer em volta"
            : r.kind === "blur"
              ? "Desfoque"
              : "Tamanho dos blocos"
        }
        value={r.strength}
        min={0}
        max={1}
        step={0.01}
        onCommit={(v) => set({ strength: v })}
      />
      <Slider
        label="Borda suave"
        value={r.feather}
        min={0}
        max={60}
        step={1}
        format={(v) => `${Math.round(v)} px`}
        onCommit={(v) => set({ feather: v })}
      />
      {(target || r.follow) && (
        <div className="props-head">
          <span className="field-label">Seguir a gravação</span>
          <Toggle
            on={!!r.follow}
            label="Seguir a gravação"
            onChange={(v) => set({ follow: v || undefined })}
          />
        </div>
      )}
      {zoomed && (
        <p className="props-hint region-zoom-note" role="status">
          A gravação embaixo tem zoom enquanto a região aparece, e a região fica parada no quadro.
          Ligue Seguir a gravação para ela acompanhar o que esconde.
        </p>
      )}
      <p className="props-hint muted">
        {r.follow
          ? "O retângulo fica preso à gravação embaixo: quando ela aproxima, ele aproxima junto. Desenhe-o com a gravação sem zoom."
          : "Arraste o retângulo na prévia para mover; arraste o canto para mudar o tamanho. Vale para tudo o que está nas faixas abaixo, como esconder o nome e o e-mail de um aluno na plataforma."}
      </p>
    </div>
  );
}

/** Points of the volume envelope and taking the sound out of a video (J and L cuts). */
export function GainSection({ clip, asset }: { clip: Clip; asset: Asset }): ReactNode {
  const time = usePlayback((s) => s.time);
  const inside = time >= clip.start && time <= clipEnd(clip);
  const local = Math.max(0, Math.min(clip.duration, time - clip.start));
  const setPoints = (fn: (c: Clip) => Clip): void => {
    if (waitForDraft("mudar o volume do clipe")) return;
    updateClip(clip.id, fn);
  };
  return (
    <div className="props-section">
      <h3>
        <Volume2 size={13} /> Volume ao longo do clipe
      </h3>
      <p className="props-hint muted">
        Na timeline, dois cliques na linha amarela do clipe selecionado criam um ponto; arraste o
        ponto para subir ou descer o volume e Alt + clique o remove.
      </p>
      <div className="row-6 row-wrap">
        <Button
          size="sm"
          variant="secondary"
          disabled={!inside}
          title={inside ? undefined : "Leve o cursor de reprodução para dentro do clipe"}
          onClick={() =>
            setPoints((c) => ({ ...c, gain: upsertGain(c.gain, local, gainDbAt(c.gain, local)) }))
          }
        >
          Ponto no cursor
        </Button>
        {!!clip.gain?.length && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setPoints((c) => {
                const { gain: _gone, ...rest } = c;
                return rest;
              })
            }
          >
            Tirar os pontos
          </Button>
        )}
        {asset.kind === "video" && clip.volume > 0 && (
          <Button
            size="sm"
            variant="secondary"
            icon={Unlink}
            onClick={() => actions.detachAudio(clip.id)}
          >
            Separar áudio
          </Button>
        )}
      </div>
    </div>
  );
}

/** "Favoritar estilo": keeps the look of what is shown for every lesson. */
export function FavoriteStyle({
  target,
  name,
  value,
  kind,
}: {
  target: StyleTarget;
  name: string;
  value: () => object;
  kind?: string;
}): ReactNode {
  const [naming, setNaming] = useState<string | null>(null);
  if (naming === null)
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={Bookmark}
        title="Guarda este estilo na biblioteca de todas as aulas (Mídia › Todas as aulas)"
        onClick={() => setNaming(name)}
      >
        Favoritar estilo
      </Button>
    );
  const save = (): void => {
    const label = naming.trim();
    setNaming(null);
    if (label) void favoriteStyle(target, label, value(), kind);
  };
  return (
    <span className="favorite-name">
      <input
        className="input"
        ref={focusOnMount}
        value={naming}
        aria-label="Nome do estilo favorito"
        onChange={(e) => setNaming(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setNaming(null);
        }}
      />
      <Button size="sm" variant="secondary" onClick={save}>
        Guardar
      </Button>
    </span>
  );
}

/** Text that comes in word by word, or an arrow drawn like a stroke (shared/reveal.ts). */
export function RevealRow({ clip, annotation }: { clip: Clip; annotation: Annotation }): ReactNode {
  const kind = revealKind(annotation);
  if (!kind) return null;
  const on = annotation.reveal === kind;
  return (
    <div className="props-head">
      <span className="field-label">
        {kind === "words" ? "Entrar palavra por palavra" : "Desenhar a seta"}
      </span>
      <Toggle
        on={on}
        label={kind === "words" ? "Entrar palavra por palavra" : "Desenhar a seta"}
        onChange={(v) => void updateAnnotation(clip.id, { reveal: v ? kind : undefined })}
      />
    </div>
  );
}

const GRADIENTS: [string, string, number][] = [
  ["#1F3A8A", "#0D0E11", 160],
  ["#3D6BFF", "#9B7BFF", 135],
  ["#0E4D47", "#C8F031", 120],
  ["#2B2D31", "#5C6B3E", 180],
];

/** What shows where no clip covers the frame: black, a color, a gradient or a picture. */
export function BackgroundSection(): ReactNode {
  const project = useProject((s) => s.project);
  if (!project) return null;
  const bg = project.background;
  const images = project.assets.filter((a) => a.kind === "image" && !a.generated && !a.missing);
  const set = (next: Background | undefined): void => {
    useProject.getState().commit((p) => {
      const out = { ...p };
      if (next) out.background = next;
      else delete out.background;
      return out;
    });
  };
  return (
    <div className="props-section">
      <h3>
        <SquareDashed size={13} /> Fundo da aula
      </h3>
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${!bg ? "is-active" : ""}`}
          onClick={() => set(undefined)}
        >
          Preto
        </button>
        <button
          type="button"
          className={`chip ${bg?.kind === "color" ? "is-active" : ""}`}
          onClick={() => set({ kind: "color", color: bg?.kind === "color" ? bg.color : "#1C1F26" })}
        >
          Cor
        </button>
        <button
          type="button"
          className={`chip ${bg?.kind === "gradient" ? "is-active" : ""}`}
          onClick={() => {
            const [from, to, angle] = GRADIENTS[0];
            set(bg?.kind === "gradient" ? bg : { kind: "gradient", from, to, angle });
          }}
        >
          Degradê
        </button>
        <button
          type="button"
          className={`chip ${bg?.kind === "image" ? "is-active" : ""}`}
          disabled={!images.length}
          title={images.length ? undefined : "Importe uma imagem na biblioteca primeiro"}
          onClick={() => images[0] && set({ kind: "image", assetId: images[0].id })}
        >
          Imagem
        </button>
      </div>
      {bg?.kind === "color" && (
        <Swatches value={bg.color} onPick={(color) => color && set({ kind: "color", color })} />
      )}
      {bg?.kind === "gradient" && (
        <>
          <div className="chip-row">
            {GRADIENTS.map(([from, to, angle]) => (
              <button
                type="button"
                key={`${from}${to}`}
                className={`chip gradient-chip ${bg.from === from && bg.to === to ? "is-active" : ""}`}
                style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}
                aria-label={`Degradê de ${from} para ${to}`}
                onClick={() => set({ kind: "gradient", from, to, angle })}
              />
            ))}
          </div>
          <Slider
            label="Ângulo"
            value={bg.angle}
            min={0}
            max={360}
            step={5}
            format={(v) => `${Math.round(v)}°`}
            onCommit={(angle) => set({ ...bg, angle })}
          />
        </>
      )}
      {bg?.kind === "image" && (
        <select
          className="select"
          aria-label="Imagem do fundo"
          value={bg.assetId}
          onChange={(e) => set({ kind: "image", assetId: e.target.value })}
        >
          {images.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <p className="props-hint muted">
        Aparece onde nenhum clipe cobre a tela, também na exportação.
      </p>
    </div>
  );
}

/** The lesson's markers: names, chapters, and going to each one. */
export function MarkersSection(): ReactNode {
  const project = useProject((s) => s.project);
  const markers = project?.markers ?? [];
  const fps = project?.settings.fps ?? 30;
  const chapters = project ? chaptersOf(project) : [];
  return (
    <div className="props-section">
      <h3>
        <MapPin size={13} /> Marcadores e capítulos
      </h3>
      {markers.length === 0 ? (
        <p className="props-hint muted">
          Aperte M na timeline para marcar o ponto do cursor. Shift+M vai ao próximo e Alt+M ao
          anterior; um marcador pode começar um capítulo do MP4.
        </p>
      ) : (
        <ul className="shared-list">
          {markers.map((m) => (
            <li key={m.id} className="shared-row">
              <button type="button" className="link mono" onClick={() => playback.seek(m.t)}>
                {timecode(m.t, fps)}
              </button>
              <span className="spacer shared-name">{m.label}</span>
              <Toggle
                on={!!m.chapter}
                label={`Capítulo ${m.label}`}
                onChange={(v) => actions.updateMarker(m.id, { chapter: v })}
              />
            </li>
          ))}
        </ul>
      )}
      {chapters.length > 0 && (
        <p className="props-hint muted">
          {chapters.length === 1 ? "1 capítulo vai" : `${chapters.length} capítulos vão`} para o MP4
          exportado.
        </p>
      )}
    </div>
  );
}
