import { isDrawingKind } from "@shared/annotation";
import { isPersonKey } from "@shared/personKey";
import {
  clipEnd,
  clipSpeed,
  parseTimecode,
  placeClips,
  projectDuration,
  sourceEnd,
  toFrame,
  trackLabels,
  trimClip,
} from "@shared/timeline";
import type { Clip, Project } from "@shared/types";
import { Film, Gauge, Image, Music, Ratio, Scissors, Sparkles, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { actions } from "@/lib/actions";
import { formatEditTime } from "@/lib/editTimer";
import { leaveField } from "@/lib/fieldText";
import { duration, timecode } from "@/lib/format";
import { hasSpeed, speedLabel } from "@/lib/speed";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { assetMap, useProject } from "@/state/project";
import { Button, Toggle } from "@/ui";
import { AnnotationSection, DrawingSection } from "./AnnotationProps";
import { AssistantPanel } from "./AssistantPanel";
import { BatchSection } from "./BatchProps";
import { CameraSection } from "./CameraSection";
import { CaptionSettings } from "./CaptionSettings";
import {
  FadeSection,
  KeySection,
  MotionPathSection,
  PlacementSection,
  TransitionSection,
} from "./ClipVisual";
import { LapseSection } from "./LapseSection";
import {
  BackgroundSection,
  ColorSection,
  DeviceSection,
  GainSection,
  MarkersSection,
  RegionSection,
} from "./LookSections";
import { PaletteSection } from "./PaletteEditor";
import { PreparePanel } from "./PreparePanel";
import { setDenoise } from "./RailPanels";
import { CursorSection, ZoomSection } from "./RecordingProps";
import { RetrySection } from "./RetrySection";
import { ScriptPanel } from "./ScriptPanel";
import { ShadowSection } from "./ShadowControls";
import { TranscriptPanel } from "./TranscriptPanel";
import { ZoomLayerSection } from "./ZoomLayerPanel";

export function SidePanel(): ReactNode {
  const tab = useApp((s) => s.sideTab);
  const set = useApp((s) => s.set);
  return (
    <aside className="side">
      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === "transcript" ? "is-active" : ""}`}
          onClick={() => set({ sideTab: "transcript" })}
        >
          Transcrição
        </button>
        <button
          type="button"
          className={`tab ${tab === "script" ? "is-active" : ""}`}
          onClick={() => set({ sideTab: "script" })}
        >
          Roteiro
        </button>
        <button
          type="button"
          className={`tab ${tab === "assistant" ? "is-active" : ""}`}
          onClick={() => set({ sideTab: "assistant" })}
        >
          <Sparkles size={13} /> Assistente
        </button>
        <button
          type="button"
          className={`tab ${tab === "properties" ? "is-active" : ""}`}
          onClick={() => set({ sideTab: "properties" })}
        >
          Propriedades
        </button>
      </div>
      <div className="side-body">
        {tab === "transcript" ? (
          <TranscriptPanel />
        ) : tab === "script" ? (
          <ScriptPanel />
        ) : tab === "prepare" ? (
          <PreparePanel />
        ) : tab === "assistant" ? (
          <AssistantPanel />
        ) : (
          <Properties />
        )}
      </div>
    </aside>
  );
}

function Properties(): ReactNode {
  const project = useProject((s) => s.project);
  const selection = useProject((s) => s.selection);
  const commit = useProject((s) => s.commit);
  if (!project) return null;

  const selected = project.clips.filter((c) => selection.includes(c.id));
  if (selected.length !== 1) {
    const assets = project.assets;
    return (
      <div className="props">
        <div className="props-section">
          <h3>{selected.length > 1 ? `${selected.length} clipes selecionados` : "Projeto"}</h3>
          <Row
            label="Formato"
            value={`${project.settings.width}×${project.settings.height} · ${project.settings.fps} fps`}
          />
          {selected.length === 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={Ratio}
              onClick={() => useApp.getState().set({ reframeOpen: true })}
            >
              Mudar formato…
            </Button>
          )}
          <Row label="Duração" value={duration(projectDuration(project))} />
          <Row label="Clipes" value={String(project.clips.length)} />
          <Row
            label="Mídias"
            value={`${assets.length} (${assets.filter((a) => a.kind === "video").length} vídeos)`}
          />
          <Row label="Tempo de edição" value={formatEditTime(project.stats?.editSeconds)} />
        </div>
        {selected.length === 0 && <PaletteSection />}
        {selected.length === 0 && <CaptionSettings />}
        {selected.length === 0 && <BackgroundSection />}
        {selected.length === 0 && <MarkersSection />}
        {selected.length > 1 ? (
          <>
            <BatchSection clips={selected} />
            <div className="props-section">
              <Button
                variant="secondary"
                icon={Trash2}
                onClick={() => actions.deleteSelection(false)}
              >
                Excluir selecionados
              </Button>
            </div>
          </>
        ) : (
          <p className="props-hint muted">
            Clique em um clipe na timeline para ver e ajustar as propriedades dele.
          </p>
        )}
      </div>
    );
  }

  const clip = selected[0];
  const asset = assetMap(project).get(clip.assetId);
  const label = trackLabels(project.tracks).get(clip.trackId);
  const fps = project.settings.fps;
  const locked = !!project.tracks.find((t) => t.id === clip.trackId)?.locked;
  const Icon = asset?.kind === "audio" ? Music : asset?.kind === "image" ? Image : Film;
  const setVolume = (v: number): void => {
    commit((p) => ({
      ...p,
      clips: p.clips.map((c) => (c.id === clip.id ? { ...c, volume: v } : c)),
    }));
  };

  return (
    <div className="props">
      <div className="clip-info">
        <span className="clip-info-icon">
          <Icon size={15} />
        </span>
        <div>
          <strong>{asset?.name ?? "Mídia removida"}</strong>
          <span className="mono muted">
            {label} · {duration(clip.duration)}
          </span>
        </div>
      </div>

      <div className="props-section">
        <h3>Tempo</h3>
        <TimeRow
          label="Início na timeline"
          value={clip.start}
          fps={fps}
          disabled={locked}
          onCommit={(v) => moveClipTo(clip, v)}
        />
        <TimeRow
          label="Fim na timeline"
          value={clipEnd(clip)}
          fps={fps}
          disabled={locked}
          onCommit={(v) => endClipAt(project, clip, v)}
        />
        <TimeRow
          label="Duração"
          value={clip.duration}
          fps={fps}
          disabled={locked}
          onCommit={(v) => endClipAt(project, clip, clip.start + v)}
        />
        <Row
          label="Trecho do original"
          value={`${timecode(clip.in, fps)} → ${timecode(sourceEnd(clip), fps)}`}
          mono
        />
        {project && hasSpeed(project, clip) && (
          <Row label="Velocidade" value={speedLabel(clipSpeed(clip))} mono />
        )}
        <div className="row-6 row-wrap">
          <Button size="sm" variant="secondary" onClick={() => playback.seek(clip.start)}>
            Ir para o início
          </Button>
          <Button size="sm" variant="secondary" icon={Scissors} onClick={actions.splitAtPlayhead}>
            Dividir no cursor
          </Button>
          {project && hasSpeed(project, clip) && !clip.timelapse && (
            <Button
              size="sm"
              variant="secondary"
              icon={Gauge}
              onClick={() => useApp.getState().set({ speedClips: [clip.id] })}
            >
              Velocidade / duração
            </Button>
          )}
        </div>
      </div>

      {clip.timelapse && <LapseSection key={clip.id} clip={clip} locked={locked} />}
      {asset?.retries?.length ? <RetrySection project={project} asset={asset} /> : null}
      {clip.zoomLayer && <ZoomLayerSection clip={clip} />}
      {clip.regionFx && <RegionSection clip={clip} region={clip.regionFx} />}
      {asset?.kind === "video" && (
        <div className="props-section">
          <Button
            size="sm"
            variant="secondary"
            disabled={project?.tracks.find((t) => t.id === clip.trackId)?.locked}
            onClick={() => useApp.getState().set({ extendClip: clip.id })}
          >
            Estender quadro…
          </Button>
        </div>
      )}

      {asset && asset.kind !== "audio" && !clip.soundOnly && !clip.zoomLayer && !clip.regionFx && (
        <>
          {clip.annotation &&
            (isDrawingKind(clip.annotation.kind) ? (
              <DrawingSection key={clip.id} clip={clip} />
            ) : (
              <AnnotationSection key={clip.id} clip={clip} />
            ))}
          {asset.kind === "video" && !clip.annotation && <ZoomSection clip={clip} asset={asset} />}
          {asset.cursor && <CursorSection asset={asset} clip={clip} />}
          <PlacementSection clip={clip} asset={asset} />
          {!clip.annotation && <ShadowSection clip={clip} />}
          <MotionPathSection clip={clip} />
          <TransitionSection clip={clip} />
          <FadeSection clip={clip} />
          {asset.kind === "video" && asset.recording?.role === "camera" && (
            <CameraSection clip={clip} asset={asset} />
          )}
          {asset.kind === "video" && !isPersonKey(asset.key) && !clip.annotation && (
            <KeySection asset={asset} />
          )}
          <ColorSection clip={clip} />
          {!clip.annotation && <DeviceSection clip={clip} />}
        </>
      )}

      {asset?.hasAudio && (
        <div className="props-section">
          <h3>Áudio do clipe</h3>
          <VolumeSlider key={clip.id} value={clip.volume} onCommit={setVolume} />
          {clip.volume > 1 && (
            <p className="props-hint muted">
              Acima de 100% o som fica mais alto também na prévia; cuidado com o estouro.
            </p>
          )}
          {!project.tracks.find((t) => t.id === clip.trackId)?.music && (
            <div className="props-head">
              <span className="field-label">Reduzir ruído (na exportação)</span>
              <Toggle
                on={!!clip.denoise}
                onChange={(v) => setDenoise([clip.id], v)}
                label="Reduzir ruído"
              />
            </div>
          )}
        </div>
      )}
      {asset?.hasAudio && !clip.zoomLayer && !clip.regionFx && (
        <GainSection clip={clip} asset={asset} />
      )}

      {!asset?.generated && (
        <div className="props-section">
          <h3>Arquivo</h3>
          <p className="path mono">{asset?.path}</p>
          {asset && asset.kind !== "audio" && (
            <Row
              label="Resolução"
              value={`${asset.width}×${asset.height}${asset.fps ? ` · ${asset.fps} fps` : ""}`}
            />
          )}
        </div>
      )}

      <div className="props-section">
        <Button variant="ghost" icon={Trash2} onClick={() => actions.deleteSelection(false)}>
          Excluir clipe
        </Button>
      </div>
    </div>
  );
}

/** Commits once when the drag ends, so one gesture is one undo step. */
function VolumeSlider({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}): ReactNode {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commitDraft = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <div className="volume-row">
      <input
        type="range"
        className="range"
        min={0}
        max={2}
        step={0.05}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commitDraft}
        onKeyUp={commitDraft}
        aria-label="Volume do clipe"
      />
      <span className="mono">{Math.round(draft * 100)}%</span>
    </div>
  );
}

/** The clip moved to start at `t` (on a frame), covering what is under it, like a drag. */
function moveClipTo(clip: Clip, t: number): void {
  useProject.getState().commit((p) => {
    const c = p.clips.find((x) => x.id === clip.id);
    if (!c) return p;
    return {
      ...p,
      clips: placeClips(p.clips, [{ ...c, start: Math.max(0, toFrame(t, p.settings.fps)) }]),
    };
  });
}

/**
 * The clip ends at `t` (on a frame): longer up to what its source has and to the next clip of
 * its track, as dragging its edge would stop there; shorter down to one frame.
 */
function endClipAt(project: Project, clip: Clip, t: number): void {
  const asset = project.assets.find((a) => a.id === clip.assetId);
  const next = Math.min(
    Infinity,
    ...project.clips
      .filter(
        (c) => c.trackId === clip.trackId && c.id !== clip.id && c.start >= clipEnd(clip) - 1e-6,
      )
      .map((c) => c.start),
  );
  const end = Math.min(toFrame(t, project.settings.fps), next);
  useProject.getState().commit((p) => ({
    ...p,
    clips: p.clips.map((c) => (c.id === clip.id ? trimClip(c, "end", end, asset) : c)),
  }));
}

/** A time typed as 00:01:23:12 (with frames), mm:ss or seconds; Enter or leaving applies it. */
function TimeRow({
  label,
  value,
  fps,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  fps: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}): ReactNode {
  const [text, setText] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  // Esc blurs the field right after asking for the text back: the blur must see it at once.
  const cancelled = useRef(false);
  const apply = (): void => {
    const result = leaveField(text, timecode(value, fps), cancelled.current, (t) =>
      parseTimecode(t, fps),
    );
    cancelled.current = false;
    setText(null);
    setWrong(result.kind === "wrong");
    if (result.kind === "commit" && Math.abs(result.value - value) > 0.5 / fps)
      onCommit(result.value);
  };
  return (
    <label className="prop-row time-row">
      <span className="muted">{label}</span>
      <input
        className={`input mono ${wrong ? "is-wrong" : ""}`}
        disabled={disabled}
        aria-label={label}
        aria-invalid={wrong}
        title="Horas:minutos:segundos:quadros, minutos:segundos ou segundos"
        value={text ?? timecode(value, fps)}
        onFocus={(e) => {
          cancelled.current = false;
          setText(timecode(value, fps));
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): ReactNode {
  return (
    <div className="prop-row">
      <span className="muted">{label}</span>
      <span className={mono ? "mono" : ""}>{value}</span>
    </div>
  );
}
