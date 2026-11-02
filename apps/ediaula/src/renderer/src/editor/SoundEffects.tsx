import {
  AUTO_SOUND_DEFAULTS,
  type AutoSounds,
  autoSoundEvents,
  type ZoomSoundChoice,
} from "@shared/autoSounds";
import { type SoundEffectId, soundEffect, soundsOf } from "@shared/soundEffects";
import { Volume2, Wind } from "lucide-react";
import type { ReactNode } from "react";
import { previewSound } from "@/lib/soundPreview";
import { useProject } from "@/state/project";
import { Toggle } from "@/ui";
import { Slider } from "./ClipVisual";

/**
 * The controls of the sound effects (shared/soundEffects.ts): a row of chips to pick a sound,
 * each heard when picked, and the lesson's automatic whoosh (shared/autoSounds.ts), set in the
 * project's properties and, as a single switch, where zooms and transitions are edited.
 */

export function SoundChips<T extends string>({
  label,
  value,
  options,
  onChange,
  volume,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; title: string; sound: SoundEffectId }[];
  onChange: (id: T) => void;
  /** The level it will play at, so the sample heard is the one the lesson gets. */
  volume: number;
}): ReactNode {
  return (
    <>
      <span className="field-label">{label}</span>
      <div className="chip-row">
        {options.map((o) => (
          <button
            type="button"
            key={o.id}
            title={`${o.title} (clique para ouvir)`}
            className={`chip ${value === o.id ? "is-active" : ""}`}
            onClick={() => {
              previewSound(o.sound, volume);
              onChange(o.id);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** The cursor's clicks, as chips. */
const CLICK_LABEL: Partial<Record<SoundEffectId, string>> = {
  clique: "Padrão",
  "clique-suave": "Suave",
  "clique-mouse": "Mouse",
  "clique-mecanico": "Mecânico",
};
export const CLICK_CHOICES = soundsOf("clique").map((s) => ({
  id: s.id,
  label: CLICK_LABEL[s.id] ?? s.name,
  title: s.hint,
  sound: s.id,
}));

const WHOOSHES = soundsOf("woosh");
const ZOOM_CHOICES: { id: ZoomSoundChoice; label: string; title: string; sound: SoundEffectId }[] =
  [
    {
      id: "par",
      label: "Entra e sai",
      title: "O swoosh que sobe quando o zoom entra e o que desce quando ele volta",
      sound: "swoosh-entrada",
    },
    ...WHOOSHES.map((s) => ({ id: s.id, label: s.name, title: s.hint, sound: s.id })),
  ];
const TRANSITION_CHOICES = WHOOSHES.map((s) => ({
  id: s.id,
  label: s.name,
  title: s.hint,
  sound: s.id,
}));

function setAutoSounds(change: Partial<AutoSounds>): void {
  useProject.getState().commit((p) => {
    const next = { ...p.autoSounds, ...change };
    const out = { ...p };
    if (next.zooms || next.transitions || next.volume !== undefined) out.autoSounds = next;
    else delete out.autoSounds;
    return out;
  });
}

/** "Efeitos sonoros automáticos", in the project's properties. */
export function AutoSoundsSection(): ReactNode {
  const project = useProject((s) => s.project);
  if (!project) return null;
  const auto = project.autoSounds ?? {};
  const volume = auto.volume ?? AUTO_SOUND_DEFAULTS.volume;
  const count = auto.zooms || auto.transitions ? autoSoundEvents(project).length : 0;
  const percent = (v: number): string => `${Math.round(v * 100)}%`;
  return (
    <div className="props-section">
      <h3>
        <Wind size={13} /> Efeitos sonoros automáticos
      </h3>
      <div className="toggle-row">
        <span className="muted">Woosh nos zooms</span>
        <Toggle
          on={!!auto.zooms}
          onChange={(v) => setAutoSounds({ zooms: v })}
          label="Woosh nos zooms"
        />
      </div>
      {auto.zooms && (
        <SoundChips
          label="Som do zoom"
          value={auto.zoomSound ?? AUTO_SOUND_DEFAULTS.zoomSound}
          options={ZOOM_CHOICES}
          volume={volume}
          onChange={(id) => setAutoSounds({ zoomSound: id })}
        />
      )}
      <div className="toggle-row">
        <span className="muted">Woosh nas transições</span>
        <Toggle
          on={!!auto.transitions}
          onChange={(v) => setAutoSounds({ transitions: v })}
          label="Woosh nas transições"
        />
      </div>
      {auto.transitions && (
        <SoundChips
          label="Som da transição"
          value={auto.transitionSound ?? AUTO_SOUND_DEFAULTS.transitionSound}
          options={TRANSITION_CHOICES}
          volume={volume}
          onChange={(id) => setAutoSounds({ transitionSound: id })}
        />
      )}
      {(auto.zooms || auto.transitions) && (
        <>
          <Slider
            label="Volume"
            value={volume}
            min={0.05}
            max={1}
            step={0.05}
            format={percent}
            onCommit={(v) => setAutoSounds({ volume: v })}
          />
          <p className="props-hint muted">
            <Volume2 size={11} />{" "}
            {count === 0
              ? "Ainda não há zoom nem transição para soar."
              : count === 1
                ? "1 woosh na aula, na prévia e na exportação."
                : `${count} wooshes na aula, na prévia e na exportação.`}{" "}
            Zooms e transições em faixas ocultas não soam.
          </p>
        </>
      )}
    </div>
  );
}

/** The lesson-wide switch, shown where a zoom or a transition is edited. */
export function AutoSoundToggle({ kind }: { kind: "zooms" | "transitions" }): ReactNode {
  const on = useProject((s) => !!s.project?.autoSounds?.[kind]);
  const volume = useProject((s) => s.project?.autoSounds?.volume ?? AUTO_SOUND_DEFAULTS.volume);
  const label = kind === "zooms" ? "Woosh nos zooms" : "Woosh nas transições";
  const sound: SoundEffectId = useProject((s) => {
    const auto = s.project?.autoSounds;
    if (kind === "transitions") return auto?.transitionSound ?? AUTO_SOUND_DEFAULTS.transitionSound;
    const z = auto?.zoomSound ?? AUTO_SOUND_DEFAULTS.zoomSound;
    return z === "par" ? "swoosh-entrada" : z;
  });
  return (
    <div
      className="toggle-row"
      title={`Vale para todos os ${kind === "zooms" ? "zooms" : "transições"} da aula: ${soundEffect(sound).name}. O som e o volume ficam em Propriedades do projeto (clique fora dos clipes).`}
    >
      <span className="muted">{label} (toda a aula)</span>
      <Toggle
        on={on}
        onChange={(v) => {
          if (v) previewSound(sound, volume);
          setAutoSounds({ [kind]: v });
        }}
        label={label}
      />
    </div>
  );
}
