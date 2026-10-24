import { focusOnMount } from "@informach/edi-desktop/renderer";
import { cutTargets } from "@shared/cleanup";
import { extendFrameAll } from "@shared/ripple";
import { clipEnd, extendFrame, MIN_CLIP, parseDuration } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { type ReactNode, useState } from "react";
import { timecode } from "@/lib/format";
import { heldSecond, stillAsset } from "@/lib/stills";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject, waitForDraft } from "@/state/project";
import { Button, Modal, Toggle } from "@/ui";

/** The last choice of "every track", for the next time the dialog opens. */
const ALL_TRACKS_KEY = "ediaula.extendFrame.allTracks";
const rememberedAll = (): boolean => {
  try {
    return localStorage.getItem(ALL_TRACKS_KEY) === "1";
  } catch {
    return false;
  }
};

export function ExtendFrameDialog(): ReactNode {
  const id = useApp((s) => s.extendClip);
  const project = useProject((s) => s.project);
  const clip = project?.clips.find((c) => c.id === id);
  const asset = project?.assets.find((a) => a.id === clip?.assetId);
  const [at] = useState(() =>
    clip ? Math.max(clip.start, Math.min(clipEnd(clip), usePlayback.getState().time)) : 0,
  );
  const [text, setText] = useState("5");
  const [allTracks, setAllTracks] = useState(rememberedAll);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = (): void => {
    if (!busy) useApp.getState().set({ extendClip: null });
  };
  if (!project || !clip || !asset) return null;
  const seconds = parseDuration(text);
  const locked = project.tracks.find((t) => t.id === clip.trackId)?.locked;
  const valid = seconds !== null && seconds >= MIN_CLIP && !locked && asset.kind === "video";
  const chooseAll = (on: boolean): void => {
    setAllTracks(on);
    try {
      localStorage.setItem(ALL_TRACKS_KEY, on ? "1" : "0");
    } catch {
      // Only a convenience: the choice is not kept.
    }
  };
  const apply = async (): Promise<void> => {
    if (!valid || busy || waitForDraft("estender o quadro")) return;
    playback.pause();
    setBusy(true);
    setError("");
    const snapshot = useProject.getState();
    try {
      const still = await stillAsset(asset, heldSecond(clip, asset, at));
      // Every track: another video across the point (the presenter) holds its own frame too.
      const targets = cutTargets(project);
      const byId = new Map(project.assets.map((a) => [a.id, a]));
      const crossing = allTracks
        ? project.clips.filter(
            (c) =>
              c.id !== clip.id &&
              c.trackId !== clip.trackId &&
              targets.has(c.trackId) &&
              !c.annotation &&
              !c.zoomLayer &&
              byId.get(c.assetId)?.kind === "video" &&
              !byId.get(c.assetId)?.missing &&
              c.start < at - 1e-6 &&
              clipEnd(c) > at + 1e-6,
          )
        : [];
      const held = new Map<string, Asset>();
      for (const c of crossing) {
        const a = byId.get(c.assetId);
        if (a) held.set(c.id, await stillAsset(a, heldSecond(c, a, at)));
      }
      const current = useProject.getState();
      if (
        current.path !== snapshot.path ||
        current.revision !== snapshot.revision ||
        current.project?.id !== project.id
      )
        throw new Error("O projeto mudou. Feche esta janela e tente novamente.");
      let selected = "";
      current.commit((p) => {
        const result = allTracks
          ? extendFrameAll(
              p,
              clip.id,
              at,
              seconds,
              still.id,
              cutTargets(p),
              new Map([...held].map(([id, a]) => [id, a.id])),
            )
          : extendFrame(p.clips, clip.id, at, seconds, still.id);
        selected = result.stillId;
        return {
          ...p,
          assets: [...p.assets, still, ...held.values()],
          clips: result.clips,
        };
      });
      useProject.getState().select([selected]);
      playback.seek(at);
      useApp.getState().set({ extendClip: null });
      useApp
        .getState()
        .toast(
          "Quadro estendido. Arraste a borda para ajustar a duração. Ctrl+Z desfaz.",
          "success",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal label="Estender quadro" onClose={close} width={480}>
      <div className="modal-body speed-body">
        <h2 className="modal-title">Estender quadro</h2>
        <p>
          Congelar o quadro em{" "}
          <strong className="mono">{timecode(at, project.settings.fps)}</strong> pelo tempo abaixo e
          depois continuar o vídeo.
        </p>
        <label>
          Tempo adicional
          <input
            className="input mono"
            aria-label="Tempo adicional"
            ref={focusOnMount}
            disabled={busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="muted">
          Segundos ou minutos:segundos (ex.: 5 ou 0:05,5). O quadro parado não tem áudio.
        </p>
        <div className="props-head">
          <span className="field-label">Abrir espaço em todas as faixas</span>
          <Toggle on={allTracks} onChange={chooseAll} label="Abrir espaço em todas as faixas" />
        </div>
        <p className="muted">
          {allTracks
            ? "Tudo o que vem depois anda junto, em todas as faixas que os cortes alcançam: a voz espera o quadro, o apresentador também para no mesmo ponto, a anotação que passa pelo ponto fica mais longa e a música segue tocando até o novo fim. Faixas travadas não mudam."
            : "Só esta faixa anda. As outras faixas continuam no mesmo lugar."}
        </p>
        {!valid && (
          <p role="alert">
            {locked
              ? "Destrave a faixa para estender o quadro."
              : "Informe um tempo válido de pelo menos 0,034 segundo."}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <Button onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={() => void apply()}>
            {busy ? "Criando quadro…" : "Estender quadro"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
