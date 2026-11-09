import {
  Camera,
  Captions,
  FastForward,
  Maximize,
  Pause,
  PictureInPicture2,
  Pin,
  Play,
  Rewind,
  Volume2,
  VolumeX,
} from "lucide-react";
import { seek, togglePlay, video } from "../lib/media";
import { fail, loadSubtitleFile, savePrefs, toast, useStore } from "../state/store";
import { toggleFullscreen } from "./Stage";

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function stepSpeed(direction: 1 | -1): void {
  const { rate } = useStore.getState();
  const i = SPEEDS.findIndex((s) => s >= rate - 1e-6);
  const next =
    SPEEDS.at(Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + direction))) ?? 1;
  useStore.setState({ rate: next });
}

export function toggleAb(): void {
  const { ab, time } = useStore.getState();
  if (!ab) useStore.setState({ ab: { a: time, b: null } });
  else if (ab.b === null && time > ab.a + 0.2) useStore.setState({ ab: { ...ab, b: time } });
  else useStore.setState({ ab: null });
}

export async function captureFrame(target: "file" | "clipboard"): Promise<void> {
  const { source, time } = useStore.getState();
  if (!source?.facts.hasVideo) return;
  video()?.pause();
  const result = await window.api.captureFrame(source.facts.path, time, target);
  if (result === "clipboard") toast("Quadro copiado.");
  else if (result) toast("Quadro salvo.");
}

export function Controls() {
  const playing = useStore((s) => s.playing);
  const rate = useStore((s) => s.rate);
  const ab = useStore((s) => s.ab);
  const prefs = useStore((s) => s.prefs);
  const subtitle = useStore((s) => s.subtitle);
  const mini = useStore((s) => s.mini);
  const onTop = useStore((s) => s.onTop);
  const hasVideo = useStore((s) => s.facts?.hasVideo ?? false);
  const back = () => seek((video()?.currentTime ?? 0) - 5);
  const forward = () => seek((video()?.currentTime ?? 0) + 5);
  return (
    <div className="controls">
      <button
        type="button"
        className="icon-btn hide-mini"
        aria-label="Voltar 5 segundos"
        title="Voltar 5 s (←)"
        onClick={back}
      >
        <Rewind size={20} />
      </button>
      <button
        type="button"
        className="play-btn"
        aria-label={playing ? "Pausar" : "Tocar"}
        title="Tocar e pausar (Espaço)"
        onClick={togglePlay}
      >
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <button
        type="button"
        className="icon-btn hide-mini"
        aria-label="Avançar 5 segundos"
        title="Avançar 5 s (→)"
        onClick={forward}
      >
        <FastForward size={20} />
      </button>
      <span className="divider hide-mini" />
      <select
        className="pill mono hide-mini"
        aria-label="Velocidade"
        title="Velocidade ([ e ])"
        value={rate}
        onChange={(e) => useStore.setState({ rate: Number(e.target.value) })}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {String(s).replace(".", ",")}×
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`pill hide-mini${ab ? " on" : ""}`}
        aria-pressed={!!ab}
        aria-label={
          ab
            ? ab.b === null
              ? "Repetição: marque o fim"
              : "Desligar a repetição"
            : "Repetir um trecho"
        }
        title="Repetir um trecho: marque o início, depois o fim (L)"
        onClick={toggleAb}
      >
        {ab ? (ab.b === null ? "A–…" : "A–B ✓") : "A–B"}
      </button>
      <span className="spacer" />
      <button
        type="button"
        className={`icon-btn hide-mini${subtitle ? " on" : ""}`}
        aria-pressed={!!subtitle}
        aria-label={subtitle ? `Desligar a legenda ${subtitle.name}` : "Abrir uma legenda"}
        title="Legendas: escolha na lateral, ou arraste um .srt"
        onClick={() => {
          if (subtitle) useStore.setState({ subtitle: null });
          else
            void window.api
              .pickSubtitle()
              .then((p) => (p ? loadSubtitleFile(p) : undefined))
              .catch(fail);
        }}
      >
        <Captions size={20} />
      </button>
      <div className="volume hide-mini">
        <button
          type="button"
          className="icon-btn"
          aria-label={prefs.muted ? "Ligar o som" : "Silenciar"}
          title="Silenciar (M)"
          onClick={() => void savePrefs({ muted: !prefs.muted })}
        >
          {prefs.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          aria-label="Volume"
          value={prefs.volume}
          onChange={(e) => void savePrefs({ volume: Number(e.target.value), muted: false })}
        />
        <span className="mono">{Math.round(prefs.volume * 100)}%</span>
      </div>
      <button
        type="button"
        className={`pill hide-mini${prefs.boost ? " on" : ""}`}
        aria-pressed={prefs.boost}
        title="Realça falas baixas"
        onClick={() => void savePrefs({ boost: !prefs.boost })}
      >
        Realçar
      </button>
      {hasVideo && (
        <button
          type="button"
          className="icon-btn hide-mini"
          aria-label="Capturar quadro"
          title="Salvar o quadro (Shift+clique copia)"
          onClick={(e) => void captureFrame(e.shiftKey ? "clipboard" : "file").catch(fail)}
        >
          <Camera size={20} />
        </button>
      )}
      <button
        type="button"
        className={`icon-btn hide-mini${onTop ? " on" : ""}`}
        aria-pressed={onTop}
        aria-label="Sempre no topo"
        title="Sempre no topo"
        onClick={() => {
          useStore.setState({ onTop: !onTop });
          void window.api.setAlwaysOnTop(!onTop).catch(fail);
        }}
      >
        <Pin size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn${mini ? " on" : ""}`}
        aria-pressed={mini}
        aria-label={mini ? "Voltar ao tamanho normal" : "Miniplayer"}
        title="Miniplayer"
        onClick={() => {
          useStore.setState({ mini: !mini });
          void window.api.setMiniPlayer(!mini).catch(fail);
        }}
      >
        <PictureInPicture2 size={18} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Tela cheia"
        title="Tela cheia (F)"
        onClick={() => void toggleFullscreen().catch(fail)}
      >
        <Maximize size={20} />
      </button>
    </div>
  );
}
