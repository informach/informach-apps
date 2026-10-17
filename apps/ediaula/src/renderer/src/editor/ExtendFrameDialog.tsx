import { focusOnMount } from "@informach/edi-desktop/renderer";
import { buildTrack, cursorAt, cursorScale, ripplesAt } from "@shared/cursor";
import {
  clipEnd,
  extendFrame,
  MIN_CLIP,
  newId,
  parseDuration,
  sourceAt,
  sourceEnd,
} from "@shared/timeline";
import type { Asset } from "@shared/types";
import { zoomAt } from "@shared/zoom";
import { type ReactNode, useState } from "react";
import { drawPointer, drawRipples } from "@/lib/cursorDraw";
import { timecode } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Modal } from "@/ui";
import { cursorFxOf, loadCursorData } from "./CursorLayer";

export function ExtendFrameDialog(): ReactNode {
  const id = useApp((s) => s.extendClip);
  const project = useProject((s) => s.project);
  const clip = project?.clips.find((c) => c.id === id);
  const asset = project?.assets.find((a) => a.id === clip?.assetId);
  const [at] = useState(() =>
    clip ? Math.max(clip.start, Math.min(clipEnd(clip), usePlayback.getState().time)) : 0,
  );
  const [text, setText] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = (): void => {
    if (!busy) useApp.getState().set({ extendClip: null });
  };
  if (!project || !clip || !asset) return null;
  const seconds = parseDuration(text);
  const locked = project.tracks.find((t) => t.id === clip.trackId)?.locked;
  const valid = seconds !== null && seconds >= MIN_CLIP && !locked && asset.kind === "video";
  const apply = async (): Promise<void> => {
    if (!valid || busy) return;
    playback.pause();
    setBusy(true);
    setError("");
    const snapshot = useProject.getState();
    try {
      if (asset.key && (!asset.keyed || asset.keyStatus !== "ready"))
        throw new Error("Aguarde a remoção de fundo terminar antes de estender o quadro.");
      const sourceTime = Math.max(
        clip.in,
        Math.min(
          sourceAt(clip, at),
          sourceEnd(clip) - 1 / (asset.fps || 30),
          asset.duration - 1 / (asset.fps || 30),
        ),
      );
      let path = await window.api.stillFrame(
        asset.key ? asset.keyed! : asset.path,
        sourceTime,
        !!asset.key,
      );
      if (asset.cursor || clip.zooms?.length) {
        const image = new Image();
        // media:// is a separate origin; request its CORS-enabled image before drawing to canvas.
        image.crossOrigin = "anonymous";
        image.src = mediaUrl(path);
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = asset.width;
        canvas.height = asset.height;
        const ctx = canvas.getContext("2d")!;
        const view = zoomAt(clip.zooms, sourceTime);
        ctx.translate(
          (0.5 - view.cx * view.scale) * canvas.width,
          (0.5 - view.cy * view.scale) * canvas.height,
        );
        ctx.scale(view.scale, view.scale);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        if (asset.cursor) {
          const data = await loadCursorData(asset.cursor);
          const fx = cursorFxOf(asset);
          const track = buildTrack(data, fx, asset.duration);
          const state = cursorAt(track, sourceTime);
          const k = canvas.width / data.width;
          ctx.scale(k, k);
          const unit = cursorScale(data, fx) * 1.1;
          if (!fx.hidden && fx.clicks)
            drawRipples(ctx, ripplesAt(data, sourceTime, fx), 0, 0, unit);
          drawPointer(ctx, state, state.x, state.y, unit, fx);
        }
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Não foi possível salvar o quadro."))),
            "image/png",
          ),
        );
        path = await window.api.saveGenerated(new Uint8Array(await blob.arrayBuffer()), "png");
      }
      const current = useProject.getState();
      if (
        current.path !== snapshot.path ||
        current.revision !== snapshot.revision ||
        current.project?.id !== project.id
      )
        throw new Error("O projeto mudou. Feche esta janela e tente novamente.");
      const still: Asset = {
        id: newId("a"),
        name: `Quadro estendido · ${asset.name}`,
        path,
        thumb: path,
        kind: "image",
        duration: 0,
        width: asset.width,
        height: asset.height,
        fps: 0,
        hasVideo: true,
        hasAudio: false,
        size: 0,
        proxyStatus: "none",
      };
      let selected = "";
      current.commit((p) => {
        const result = extendFrame(p.clips, clip.id, at, seconds, still.id);
        selected = result.stillId;
        return { ...p, assets: [...p.assets, still], clips: result.clips };
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
    <Modal label="Estender quadro" onClose={close} width={460}>
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
          Segundos ou minutos:segundos (ex.: 5 ou 0:05,5). O restante desta faixa será deslocado.
          Outras faixas continuam no mesmo lugar. O quadro parado não tem áudio.
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
