import { clipEnd, clipSpeed, projectDuration, sourceEnd, trackLabels } from "@shared/timeline";
import { Film, Gauge, Image, Music, Scissors, Sparkles, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { actions } from "@/lib/actions";
import { formatEditTime } from "@/lib/editTimer";
import { duration, timecode } from "@/lib/format";
import { hasSpeed, speedLabel } from "@/lib/speed";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { assetMap, useProject } from "@/state/project";
import { Button, Toggle } from "@/ui";
import { AnnotationSection } from "./AnnotationProps";
import { AssistantPanel } from "./AssistantPanel";
import { CaptionSettings } from "./CaptionSettings";
import {
  FadeSection,
  KeySection,
  MotionPathSection,
  PlacementSection,
  TransitionSection,
} from "./ClipVisual";
import { PaletteSection } from "./PaletteEditor";
import { setDenoise } from "./RailPanels";
import { CursorSection, ZoomSection } from "./RecordingProps";
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
        {selected.length > 1 ? (
          <div className="props-section">
            <Button
              variant="secondary"
              icon={Trash2}
              onClick={() => actions.deleteSelection(false)}
            >
              Excluir selecionados
            </Button>
          </div>
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
        <Row label="Início na timeline" value={timecode(clip.start, fps)} mono />
        <Row label="Fim na timeline" value={timecode(clipEnd(clip), fps)} mono />
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
          {project && hasSpeed(project, clip) && (
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

      {clip.zoomLayer && <ZoomLayerSection clip={clip} />}
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

      {asset && asset.kind !== "audio" && !clip.zoomLayer && (
        <>
          {clip.annotation && <AnnotationSection key={clip.id} clip={clip} />}
          {asset.kind === "video" && <ZoomSection clip={clip} asset={asset} />}
          {asset.cursor && <CursorSection asset={asset} />}
          <PlacementSection clip={clip} asset={asset} />
          {!clip.annotation && <ShadowSection clip={clip} />}
          <MotionPathSection clip={clip} />
          <TransitionSection clip={clip} />
          <FadeSection clip={clip} />
          {asset.kind === "video" && <KeySection asset={asset} />}
        </>
      )}

      {asset?.hasAudio && (
        <div className="props-section">
          <h3>Áudio do clipe</h3>
          <VolumeSlider key={clip.id} value={clip.volume} onCommit={setVolume} />
          {clip.volume > 1 && (
            <p className="props-hint muted">
              Acima de 100% o ganho é aplicado na exportação; o preview toca no máximo a 100%.
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): ReactNode {
  return (
    <div className="prop-row">
      <span className="muted">{label}</span>
      <span className={mono ? "mono" : ""}>{value}</span>
    </div>
  );
}
