import { clipSpeed, parseDuration, SPEED_MAX, SPEED_MIN, speedForDuration } from "@shared/timeline";
import { Gauge, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { duration } from "@/lib/format";
import { applySpeed, commonSpeed, hasSpeed, SPEED_PRESETS, speedLabel } from "@/lib/speed";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Button, Chip, IconButton, Modal, Toggle } from "@/ui";

// The slider works on a log scale so 0.5× and 2× sit at the same distance from 1×.
const toSlider = (s: number): number => Math.log2(s);
const fromSlider = (v: number): number => Math.round(2 ** v * 100) / 100;

/** Clip speed (opened from the clip's right-click menu or its properties): presets or any value, before/after lengths. */
export function SpeedDialog(): ReactNode {
  const ids = useApp((s) => s.speedClips);
  const project = useProject((s) => s.project);
  const close = (): void => {
    useApp.getState().set({ speedClips: null });
  };
  const clips =
    project && ids
      ? project.clips.filter(
          (c) =>
            ids.includes(c.id) &&
            hasSpeed(project, c) &&
            !project.tracks.find((t) => t.id === c.trackId)?.locked,
        )
      : [];
  const [speed, setSpeed] = useState(() => commonSpeed(clips) ?? 1);
  const [ripple, setRipple] = useState(true);
  const [target, setTarget] = useState<string | null>(null);
  if (!project || !ids) return null;
  const before = clips.reduce((t, c) => t + c.duration, 0);
  const after = clips.reduce((t, c) => t + (c.duration * clipSpeed(c)) / speed, 0);
  const seconds = target === null ? after : parseDuration(target);
  const requestedSpeed = seconds === null ? null : speedForDuration(clips, seconds);
  const changeSpeed = (value: number): void => {
    setSpeed(value);
    setTarget(null);
  };
  const apply = (): void => {
    if (requestedSpeed === null) return;
    const n = applySpeed(ids, requestedSpeed, ripple);
    close();
    if (n)
      useApp
        .getState()
        .toast(
          `Velocidade ${speedLabel(requestedSpeed)} em ${n === 1 ? "1 clipe" : `${n} clipes`}. Ctrl+Z desfaz.`,
          "success",
        );
  };

  return (
    <Modal label="Velocidade do clipe" onClose={close} width={460}>
      <div className="export-head">
        <Gauge size={18} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">Velocidade do clipe</h2>
          <p className="muted">
            Mais rápido encurta o clipe; mais lento alonga. A voz mantém o tom.
          </p>
        </div>
        <IconButton icon={X} label="Fechar" onClick={close} />
      </div>
      <div className="modal-body speed-body">
        {clips.length === 0 ? (
          <p className="muted">
            Selecione vídeo ou áudio numa faixa destravada. Para imagens, anotações e camadas de
            zoom, mude a duração arrastando a borda na timeline.
          </p>
        ) : (
          <>
            <div className="chip-row">
              {SPEED_PRESETS.map((s) => (
                <Chip key={s} active={Math.abs(s - speed) < 1e-3} onClick={() => changeSpeed(s)}>
                  {speedLabel(s)}
                </Chip>
              ))}
            </div>
            <div className="speed-slider">
              <input
                type="range"
                className="range"
                min={toSlider(SPEED_MIN)}
                max={toSlider(SPEED_MAX)}
                step={0.01}
                value={toSlider(speed)}
                onChange={(e) => changeSpeed(fromSlider(Number(e.target.value)))}
                aria-label="Velocidade"
              />
              <input
                type="number"
                className="input mono speed-input"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={0.05}
                value={speed}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= SPEED_MIN && v <= SPEED_MAX) changeSpeed(v);
                }}
              />
              <span className="muted">×</span>
            </div>
            <label>
              {clips.length > 1 ? "Duração total desejada (soma dos clipes)" : "Duração desejada"}
              <input
                className="input mono"
                aria-label="Duração desejada"
                value={target ?? String(Number(after.toFixed(3)))}
                onChange={(e) => {
                  setTarget(e.target.value);
                  const t = parseDuration(e.target.value);
                  const s = t === null ? null : speedForDuration(clips, t);
                  if (s !== null) setSpeed(s);
                }}
              />
              <span className="muted">Segundos ou minutos:segundos. Ex.: 90 ou 1:30,5.</span>
            </label>
            {requestedSpeed === null && (
              <p role="alert">
                Informe uma duração válida que resulte em velocidade entre 0,25× e 8×.
              </p>
            )}
            <p className="speed-summary">
              Duração: <span className="mono">{duration(before)}</span> →{" "}
              <strong className="mono">{duration(after)}</strong>
              {clips.length > 1 && <span className="muted"> ({clips.length} clipes)</span>}
            </p>
            <div className="speed-ripple">
              <Toggle on={ripple} onChange={setRipple} label="Mover o que vem depois" />
              <span>
                Mover o que vem depois na faixa
                <span className="muted">
                  {" "}
                  {ripple
                    ? "(sem buracos e sem cobrir nada)"
                    : "(mais lento cobre o que vem depois; mais rápido deixa um espaço)"}
                </span>
              </span>
            </div>
          </>
        )}
        <div className="modal-actions">
          <Button onClick={close}>Cancelar</Button>
          {clips.length > 0 && (
            <Button variant="primary" onClick={apply} disabled={requestedSpeed === null}>
              Aplicar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
