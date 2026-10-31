import type { CameraChoice, CameraMode } from "@shared/camera";
import { cameraModeLabel } from "@shared/camera";
import {
  acceleratorFromKey,
  activeHotkeys,
  HOTKEY_LABELS,
  type HotkeyAction,
  type HotkeyReport,
  hotkeyConflicts,
  hotkeyLabel,
} from "@shared/hotkeys";
import type { RecorderSettings } from "@shared/recorderSettings";
import { X } from "lucide-react";
import { type ReactNode, useState } from "react";

const modeKey = (m: CameraChoice): string =>
  `${m.codec ?? m.pixelFormat}:${m.width}x${m.height}@${m.fps}`;

/** Modes worth offering: each size and format once, at the best rate up to 30 (or 60). */
function offeredModes(modes: CameraMode[], fps: number): CameraChoice[] {
  const seen = new Set<string>();
  return modes
    .filter((m) => m.maxFps >= 10)
    .sort((a, b) => b.width * b.height - a.width * a.height || b.maxFps - a.maxFps)
    .map((m) => ({
      ...(m.codec ? { codec: m.codec } : { pixelFormat: m.pixelFormat }),
      width: m.width,
      height: m.height,
      fps: Math.min(fps, m.maxFps),
    }))
    .filter((m) => {
      const key = modeKey(m);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** The webcam mode: automatic (shared/camera.ts) or one the camera lists. */
export function CameraModeSelect({
  modes,
  value,
  onChange,
  fps,
}: {
  modes: { modes: CameraMode[]; choice: CameraChoice | null } | null;
  value: CameraChoice | null;
  onChange: (mode: CameraChoice | null) => void;
  fps: number;
}): ReactNode {
  const offered = modes ? offeredModes(modes.modes, fps) : [];
  return (
    <select
      value={value ? modeKey(value) : ""}
      onChange={(e) => onChange(offered.find((m) => modeKey(m) === e.target.value) ?? null)}
      title={`Modo da câmera: ${value ? cameraModeLabel(value) : modes?.choice ? `automático, ${cameraModeLabel(modes.choice)}` : "automático"}`}
    >
      <option value="">
        {modes?.choice ? `Automático · ${cameraModeLabel(modes.choice)}` : "Automático"}
      </option>
      {offered.map((m) => (
        <option key={modeKey(m)} value={modeKey(m)}>
          {cameraModeLabel(m)}
        </option>
      ))}
    </select>
  );
}

/** One shortcut: click, then press the keys. */
function HotkeyField({
  action,
  value,
  problem,
  onChange,
}: {
  action: HotkeyAction;
  value: string;
  problem?: string;
  onChange: (accelerator: string) => void;
}): ReactNode {
  const [listening, setListening] = useState(false);
  return (
    <div className="rec-opt-row">
      <span>{HOTKEY_LABELS[action]}</span>
      <button
        type="button"
        className={`rec-opt-key ${listening ? "is-listening" : ""} ${problem ? "is-bad" : ""}`}
        title={problem ?? "Clique e pressione o novo atalho"}
        onClick={() => setListening(true)}
        onBlur={() => setListening(false)}
        onKeyDown={(e) => {
          if (!listening) return;
          e.preventDefault();
          if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
            setListening(false);
            return;
          }
          const accelerator = acceleratorFromKey(e.code, {
            ctrl: e.ctrlKey,
            alt: e.altKey,
            shift: e.shiftKey,
            meta: e.metaKey,
          });
          if (!accelerator) return;
          setListening(false);
          onChange(accelerator);
        }}
      >
        {listening ? "Pressione o atalho…" : hotkeyLabel(value)}
      </button>
      {problem && <small className="rec-opt-bad">{problem}</small>}
    </div>
  );
}

/** The recorder's options: frame rate, quality, countdown, camera delay and shortcuts. */
export function RecorderOptions({
  settings,
  change,
  reports,
  onClose,
}: {
  settings: RecorderSettings;
  change: (patch: Partial<RecorderSettings>) => void;
  reports: HotkeyReport[];
  onClose: () => void;
}): ReactNode {
  const conflicts = hotkeyConflicts(settings.hotkeys, settings.clicker);
  const problemOf = (action: HotkeyAction): string | undefined => {
    const conflict = conflicts.find((c) => c.action === action);
    if (conflict)
      return conflict.problem === "duplicate" && conflict.other
        ? `Repete o atalho de ${HOTKEY_LABELS[conflict.other]}.`
        : "Atalho inválido.";
    const report = reports.find(
      (r) => r.action === action && r.accelerator === settings.hotkeys[action],
    );
    return report && !report.ok ? report.reason : undefined;
  };
  return (
    <div className="rec-options" role="dialog" aria-label="Opções do gravador">
      <div className="rec-opt-head">
        <strong>Opções do gravador</strong>
        <button type="button" className="rec-icon" title="Fechar opções" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="rec-opt-grid">
        <label className="rec-opt-row">
          <span>Quadros por segundo</span>
          <select
            value={settings.fps}
            onChange={(e) => change({ fps: e.target.value === "60" ? 60 : 30 })}
          >
            <option value={30}>30 qps</option>
            <option value={60}>60 qps (movimento mais suave, arquivo maior)</option>
          </select>
        </label>
        <label className="rec-opt-row">
          <span>Qualidade</span>
          <select
            value={settings.quality}
            onChange={(e) => change({ quality: e.target.value === "high" ? "high" : "standard" })}
          >
            <option value="standard">Padrão</option>
            <option value="high">Alta (letras pequenas e código)</option>
          </select>
        </label>
        <label className="rec-opt-row">
          <span>Contagem antes de gravar</span>
          <select
            value={settings.countdown}
            onChange={(e) => change({ countdown: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 5, 10].map((s) => (
              <option key={s} value={s}>
                {s ? `${s} s` : "Sem contagem"}
              </option>
            ))}
          </select>
        </label>
        <label className="rec-opt-row">
          <span>Atraso da câmera</span>
          <input
            type="number"
            min={0}
            max={1000}
            step={10}
            value={settings.cameraLatency}
            onChange={(e) =>
              change({
                cameraLatency: Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0))),
              })
            }
          />
          <small className="rec-opt-hint">
            ms que a imagem da webcam chega atrasada em relação à voz
          </small>
        </label>
        <label className="rec-opt-check">
          <input
            type="checkbox"
            checked={settings.controlsElsewhere}
            onChange={(e) => change({ controlsElsewhere: e.target.checked })}
          />
          Com mais de uma tela, os controles ficam numa tela que não está sendo gravada (a tela
          gravada mostra só a região e continua livre para usar)
        </label>
        <label className="rec-opt-check">
          <input
            type="checkbox"
            checked={settings.pauseBackground}
            onChange={(e) => change({ pauseBackground: e.target.checked })}
          />
          Segurar exportações, proxies, transcrições e remoção de fundo durante a gravação
        </label>
        <label className="rec-opt-check">
          <input
            type="checkbox"
            checked={settings.clicker}
            onChange={(e) => change({ clicker: e.target.checked })}
          />
          Passador de slides (Page Down e Page Up) muda a fala do teleprompter
        </label>
        <label className="rec-opt-check">
          <input
            type="checkbox"
            checked={settings.autoZoom}
            onChange={(e) => change({ autoZoom: e.target.checked })}
          />
          Zoom automático ao importar a gravação (nos cliques, nos arrastos e na digitação)
        </label>
        <label className="rec-opt-check">
          <input
            type="checkbox"
            checked={settings.autoTranscribe}
            onChange={(e) => change({ autoTranscribe: e.target.checked })}
          />
          Transcrever a voz sozinho ao importar ou gravar (para o gravador mostrar as falas)
        </label>
      </div>
      <div className="rec-opt-head">
        <strong>Atalhos</strong>
        <small className="muted">
          Iniciar, parar e o alvo valem com o gravador aberto; os outros, só durante a gravação.
        </small>
      </div>
      <div className="rec-opt-grid">
        {activeHotkeys(settings.clicker).map((action) => (
          <HotkeyField
            key={action}
            action={action}
            value={settings.hotkeys[action]}
            problem={problemOf(action)}
            onChange={(accelerator) =>
              change({ hotkeys: { ...settings.hotkeys, [action]: accelerator } })
            }
          />
        ))}
      </div>
    </div>
  );
}
