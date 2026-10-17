import { type ChromaKey, DEFAULT_KEY } from "@shared/chroma";
import {
  AVATAR_FADE,
  AVATAR_PLACEMENTS,
  type Crop,
  DEFAULT_TRANSFORM,
  MOTIONS,
  type Motion,
  NO_CROP,
  placementTransform,
  squareCrop,
  type Transform,
} from "@shared/compose";
import { transformAt, upsertKeyframe } from "@shared/keyframes";
import { DEFAULT_TRANSITION, previousClip, TRANSITIONS } from "@shared/transitions";
import type { Asset, Clip } from "@shared/types";
import {
  Crop as CropIcon,
  Loader,
  Move,
  Pipette,
  RotateCcw,
  SlidersHorizontal,
  Wand2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { keyIsCurrent } from "@/lib/keying";
import { makeTransition } from "@/lib/transitions";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Toggle } from "@/ui";
import { KeyDialog } from "./KeyDialog";
import { Swatches } from "./Swatches";

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** A slider that previews while dragging and commits once on release (one undo step). */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format = pct,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onCommit: (v: number) => void;
}): ReactNode {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const done = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <label className="slider-row">
      <span className="muted">{label}</span>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={done}
        onKeyUp={done}
        aria-label={label}
      />
      <span className="mono slider-value">{format(draft)}</span>
    </label>
  );
}

export function updateClip(id: string, fn: (c: Clip) => Clip): void {
  useProject
    .getState()
    .commit((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? fn(c) : c)) }));
}

export function PlacementSection({ clip, asset }: { clip: Clip; asset: Asset }): ReactNode {
  const t = clip.transform ?? DEFAULT_TRANSFORM;
  const crop = t.crop ?? NO_CROP;
  const set = (changes: Partial<Transform>): void => {
    updateClip(clip.id, (c) => ({
      ...c,
      transform: { ...(c.transform ?? DEFAULT_TRANSFORM), ...changes },
    }));
  };
  const setCrop = (side: keyof Crop, v: number): void => {
    set({ crop: { ...crop, [side]: v } });
  };
  const portrait = asset.height > asset.width;
  const [cropOpen, setCropOpen] = useState(!!t.crop);
  const active = AVATAR_PLACEMENTS.find(
    (p) =>
      Math.abs(p.transform.x - t.x) < 0.005 &&
      Math.abs(p.transform.y - t.y) < 0.005 &&
      Math.abs(p.transform.scale - t.scale) < 0.005,
  );

  return (
    <div className="props-section">
      <div className="props-head">
        <h3>
          <Move size={13} /> Posição e tamanho
        </h3>
        {clip.transform && (
          <button
            type="button"
            className="link-btn"
            onClick={() => updateClip(clip.id, (c) => ({ ...c, transform: undefined }))}
            title="Volta a ocupar a tela inteira"
          >
            <RotateCcw size={12} /> Ajustar à tela
          </button>
        )}
      </div>
      {(portrait || asset.screen) && (
        <div className="chip-row">
          {AVATAR_PLACEMENTS.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`chip ${active?.id === p.id ? "is-active" : ""}`}
              onClick={() => set(placementTransform(p.id, t))}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <span className="field-label">Forma</span>
      <div className="chip-row">
        {(
          [
            [undefined, "Retângulo"],
            ["rounded", "Arredondado"],
            ["circle", "Círculo"],
          ] as const
        ).map(([m, label]) => (
          <button
            type="button"
            key={label}
            className={`chip ${t.mask === m ? "is-active" : ""}`}
            onClick={() =>
              set({
                mask: m,
                ...(m === "circle" && !t.crop
                  ? { crop: squareCrop(asset.width, asset.height) }
                  : {}),
                ...(m !== "circle" && t.mask === "circle" ? { crop: undefined } : {}),
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <Swatches value={t.border} none="Sem borda" onPick={(border) => set({ border })} />
      <Slider
        label="Tamanho"
        value={t.scale}
        min={0.1}
        max={3}
        step={0.01}
        onCommit={(v) => set({ scale: v })}
      />
      <Slider
        label="Horizontal"
        value={t.x}
        min={-0.25}
        max={1.25}
        step={0.005}
        onCommit={(v) => set({ x: v })}
      />
      <Slider
        label="Vertical"
        value={t.y}
        min={-0.25}
        max={1.25}
        step={0.005}
        onCommit={(v) => set({ y: v })}
      />
      <Slider
        label="Opacidade"
        value={t.opacity}
        min={0}
        max={1}
        step={0.01}
        onCommit={(v) => set({ opacity: v })}
      />
      <button type="button" className="link-btn" onClick={() => setCropOpen(!cropOpen)}>
        <CropIcon size={12} /> {cropOpen ? "Esconder corte das bordas" : "Cortar bordas"}
      </button>
      {cropOpen && (
        <>
          <Slider
            label="Esquerda"
            value={crop.left}
            min={0}
            max={0.45}
            step={0.005}
            onCommit={(v) => setCrop("left", v)}
          />
          <Slider
            label="Direita"
            value={crop.right}
            min={0}
            max={0.45}
            step={0.005}
            onCommit={(v) => setCrop("right", v)}
          />
          <Slider
            label="Topo"
            value={crop.top}
            min={0}
            max={0.45}
            step={0.005}
            onCommit={(v) => setCrop("top", v)}
          />
          <Slider
            label="Base"
            value={crop.bottom}
            min={0}
            max={0.45}
            step={0.005}
            onCommit={(v) => setCrop("bottom", v)}
          />
        </>
      )}
      <p className="props-hint muted">
        Dica: arraste o clipe no vídeo para mover e puxe um canto para mudar o tamanho (Alt desliga
        o ímã).
      </p>
    </div>
  );
}

export function FadeSection({ clip }: { clip: Clip }): ReactNode {
  const max = Math.min(3, clip.duration / 2);
  const sec = (v: number): string => `${v.toFixed(1)} s`;
  const row = (label: string, which: "enter" | "exit"): ReactNode => {
    const dur = which === "enter" ? clip.fadeIn : clip.fadeOut;
    const motion = dur ? (clip[which] ?? "fade") : undefined;
    const setMotion = (m: Motion | undefined): void => {
      updateClip(clip.id, (c) => {
        const key = which === "enter" ? "fadeIn" : "fadeOut";
        if (!m) return { ...c, [key]: undefined, [which]: undefined };
        return { ...c, [which]: m, [key]: c[key] || (m === "fade" ? AVATAR_FADE : 0.4) };
      });
    };
    return (
      <>
        <span className="field-label">{label}</span>
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${!motion ? "is-active" : ""}`}
            onClick={() => setMotion(undefined)}
          >
            Nenhuma
          </button>
          {MOTIONS.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`chip ${motion === m.id ? "is-active" : ""}`}
              onClick={() => setMotion(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {motion && (
          <Slider
            label="Duração"
            value={dur ?? 0}
            min={0.1}
            max={max}
            step={0.05}
            format={sec}
            onCommit={(v) =>
              updateClip(clip.id, (c) => ({ ...c, [which === "enter" ? "fadeIn" : "fadeOut"]: v }))
            }
          />
        )}
      </>
    );
  };
  return (
    <div className="props-section">
      <h3>Entrada e saída</h3>
      {row("Entrada", "enter")}
      {row("Saída", "exit")}
    </div>
  );
}

export function setAssetKey(assetId: string, key: ChromaKey | undefined): void {
  useProject
    .getState()
    .commit((p) => ({ ...p, assets: p.assets.map((a) => (a.id === assetId ? { ...a, key } : a)) }));
}

export function KeySection({ asset }: { asset: Asset }): ReactNode {
  const [dialog, setDialog] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const jobs = useApp((s) => s.jobs);
  const job = Object.values(jobs).find((j) => j.label === `Removendo fundo: ${asset.name}`);
  const key = asset.key;
  const set = (changes: Partial<ChromaKey>): void => {
    setAssetKey(asset.id, { ...key!, ...changes });
  };

  const detect = async (): Promise<string | null> => {
    setDetecting(true);
    const color = await window.api.detectScreen(
      asset.path,
      asset.duration,
      asset.width,
      asset.height,
    );
    setDetecting(false);
    if (!color)
      useApp
        .getState()
        .toast(
          "Não encontrei um fundo azul ou verde liso nas bordas deste vídeo. Escolha a cor manualmente.",
          "error",
        );
    return color;
  };

  const enable = async (on: boolean): Promise<void> => {
    if (!on) return setAssetKey(asset.id, undefined);
    const color = asset.screen ?? (await detect()) ?? "#00B140";
    setAssetKey(asset.id, { color, ...DEFAULT_KEY });
  };

  return (
    <div className="props-section">
      <div className="props-head">
        <h3>
          <Wand2 size={13} /> Remover fundo
        </h3>
        <Toggle on={!!key} onChange={(v) => void enable(v)} label="Remover fundo" />
      </div>
      {!key ? (
        <p className="props-hint muted">
          Para avatares gravados em fundo azul ou verde (HeyGen). Vale para todos os trechos desta
          mídia.
        </p>
      ) : (
        <>
          <div className="key-color-row">
            <label className="key-swatch" style={{ background: key.color }} title="Cor do fundo">
              <input
                type="color"
                value={key.color}
                onChange={(e) => set({ color: e.target.value.toUpperCase() })}
              />
            </label>
            <span className="mono">{key.color}</span>
            <span className="spacer" />
            <Button
              size="sm"
              variant="ghost"
              icon={Pipette}
              disabled={detecting}
              onClick={async () => {
                const c = await detect();
                if (c) set({ color: c });
              }}
            >
              Detectar
            </Button>
          </div>
          <Slider
            label="Proteger roupa"
            value={key.threshold}
            min={0}
            max={0.8}
            step={0.01}
            onCommit={(v) => set({ threshold: v })}
          />
          <Slider
            label="Suavidade"
            value={key.softness}
            min={0.05}
            max={1}
            step={0.01}
            onCommit={(v) => set({ softness: v })}
          />
          <Slider
            label="Tirar reflexo"
            value={key.despill}
            min={0}
            max={1}
            step={0.05}
            onCommit={(v) => set({ despill: v })}
          />
          <Slider
            label="Afinar contorno"
            value={key.choke}
            min={0}
            max={4}
            step={1}
            format={(v) => `${v} px`}
            onCommit={(v) => set({ choke: v })}
          />
          <div className="key-status muted">
            {keyIsCurrent(asset) ? (
              "Pronto: a prévia e a exportação usam o recorte."
            ) : asset.keyStatus === "error" ? (
              <span className="err">Falhou. Mude um ajuste para tentar de novo.</span>
            ) : (
              <>
                <Loader size={12} className="spin" /> Processando
                {job ? ` ${Math.round(job.ratio * 100)}%` : "…"} (a prévia mostra o fundo até
                terminar)
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={SlidersHorizontal}
            onClick={() => setDialog(true)}
          >
            Ajustar com prévia…
          </Button>
        </>
      )}
      {dialog && key && (
        <KeyDialog
          asset={asset}
          initial={key}
          onClose={() => setDialog(false)}
          onApply={(k) => setAssetKey(asset.id, k)}
        />
      )}
    </div>
  );
}

/** Transition from the clip right before this one on the same track. */
export function TransitionSection({ clip }: { clip: Clip }): ReactNode {
  const clips = useProject((s) => s.project?.clips ?? []);
  if (!previousClip(clips, clip)) return null;
  const tr = clip.transition;
  return (
    <div className="props-section">
      <h3>Transição da cena anterior</h3>
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${!tr ? "is-active" : ""}`}
          onClick={() => updateClip(clip.id, (c) => ({ ...c, transition: undefined }))}
        >
          Corte seco
        </button>
        {TRANSITIONS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`chip ${tr?.kind === t.id ? "is-active" : ""}`}
            onClick={() =>
              updateClip(clip.id, (c) => ({
                ...c,
                transition: makeTransition(
                  t.id,
                  c.transition?.duration ?? DEFAULT_TRANSITION.duration,
                ),
              }))
            }
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tr && (
        <Slider
          label="Duração"
          value={tr.duration}
          min={0.2}
          max={2}
          step={0.05}
          format={(v) => `${v.toFixed(1)} s`}
          onCommit={(v) =>
            updateClip(clip.id, (c) => ({ ...c, transition: { ...tr, duration: v } }))
          }
        />
      )}
    </div>
  );
}

/** Free movement: positions marked at moments of the clip; it glides between them. */
export function MotionPathSection({ clip }: { clip: Clip }): ReactNode {
  const time = usePlayback((s) => s.time);
  const local = Math.max(0, Math.min(clip.duration, time - clip.start));
  const inside = time >= clip.start && time <= clip.start + clip.duration;
  const kfs = clip.keyframes ?? [];
  // A piece of a cut clip keeps the positions of the whole clip, so the glide stays the same
  // and comes back when the piece is made longer; the list shows the ones inside it.
  const shown = kfs.filter((k) => k.t >= -1e-6 && k.t <= clip.duration + 1e-6);
  const outside = kfs.length - shown.length;
  const mark = (): void => {
    updateClip(clip.id, (c) => {
      const now = transformAt(c, time);
      // The first mark also keeps where the clip was at its start, so it has somewhere to move from.
      const start =
        c.keyframes?.length || local < 0.05 ? [] : [{ t: 0, x: now.x, y: now.y, scale: now.scale }];
      return {
        ...c,
        keyframes: upsertKeyframe([...(c.keyframes ?? []), ...start], {
          t: local,
          x: now.x,
          y: now.y,
          scale: now.scale,
        }),
      };
    });
  };
  const fmt = (s: number): string =>
    `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  return (
    <div className="props-section">
      <div className="props-head">
        <h3>Movimento</h3>
        {kfs.length > 0 && (
          <button
            type="button"
            className="link-btn"
            onClick={() => updateClip(clip.id, (c) => ({ ...c, keyframes: undefined }))}
          >
            Tirar movimento
          </button>
        )}
      </div>
      <p className="props-hint muted">
        {kfs.length
          ? "Leve o cursor a outro momento, arraste o clipe no vídeo para a nova posição: ele desliza até lá."
          : "Marque a posição em um momento, depois arraste o clipe em outro momento: ele desliza entre as posições."}
      </p>
      <Button size="sm" variant="secondary" disabled={!inside} onClick={mark}>
        Marcar posição aqui ({fmt(clip.start + local)})
      </Button>
      {outside > 0 && (
        <p className="props-hint muted">
          {outside === 1
            ? "Mais 1 posição fora deste trecho do clipe."
            : `Mais ${outside} posições fora deste trecho do clipe.`}{" "}
          Elas voltam a valer se você aumentar o clipe pela borda.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="zoom-list">
          {shown.map((k) => (
            <li key={k.t}>
              <button
                type="button"
                className="zoom-go"
                onClick={() => playback.seek(clip.start + k.t)}
              >
                <span className="mono">{fmt(clip.start + k.t)}</span>
                <span className="muted">
                  {Math.round(k.x * 100)}%, {Math.round(k.y * 100)}% · {Math.round(k.scale * 100)}%
                </span>
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Tirar esta posição"
                onClick={() =>
                  updateClip(clip.id, (c) => ({
                    ...c,
                    keyframes: (c.keyframes ?? []).filter((x) => x.t !== k.t),
                  }))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
