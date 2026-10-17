import { insertNarration } from "@shared/narration";
import { newId } from "@shared/timeline";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { timecode } from "@/lib/format";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { PreviewMedia } from "@/ui/PreviewMedia";
import "./narration.css";

export function NarrationPanel({
  projectId,
  start,
  end,
  fps,
  close,
}: {
  projectId: string;
  start: number;
  end: number;
  fps: number;
  close: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "preparing" | "recording" | "review" | "saving">(
    "idle",
  );
  const [take, setTake] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [captionText, setCaptionText] = useState("");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedPath = useRef<string | null>(null);
  const duration = end - start;
  const takeCues = useMemo(
    () => [{ start: 0, end: elapsed || duration, text: captionText }],
    [captionText, elapsed, duration],
  );

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (usePlayback.getState().playing) playback.pause();
    stream.current?.getTracks().forEach((t) => {
      t.stop();
    });
  }, []);
  const closeForProjectChange = useEffectEvent(close);

  useEffect(() => {
    alive.current = true;
    playback.pause();
    playback.seek(start);
    void navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        if (alive.current) setDevices(list.filter((d) => d.kind === "audioinput"));
      })
      .catch(() => {});
    const key = (e: KeyboardEvent) => {
      if (!(e.target as HTMLElement).closest(".narration-panel")) e.preventDefault();
      e.stopImmediatePropagation();
    };
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("beforeunload", unload);
    const unsubscribe = useProject.subscribe((s) => {
      if (s.project?.id !== projectId) closeForProjectChange();
    });
    return () => {
      alive.current = false;
      stop();
      unsubscribe();
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [projectId, start, stop]);

  useEffect(() => {
    if (!take) {
      setUrl("");
      return;
    }
    const value = URL.createObjectURL(take);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [take]);

  useEffect(() => {
    if (phase !== "recording") return;
    return usePlayback.subscribe((s) => {
      setElapsed(Math.min(duration, Math.max(0, s.time - start)));
      if (s.time >= end || !s.playing) stop();
    });
  }, [phase, duration, start, end, stop]);

  async function record() {
    setError("");
    setPhase("preparing");
    try {
      const input = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(device ? { deviceId: { exact: device } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (!alive.current) {
        input.getTracks().forEach((t) => {
          t.stop();
        });
        return;
      }
      stream.current = input;
      const list = await navigator.mediaDevices.enumerateDevices();
      if (!alive.current) {
        input.getTracks().forEach((t) => {
          t.stop();
        });
        return;
      }
      setDevices(list.filter((d) => d.kind === "audioinput"));
      const rec = new MediaRecorder(input, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 160000,
      });
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        if (alive.current)
          setError("Falha no microfone. Ouça a tomada antes de inserir ou grave novamente.");
        stop();
      };
      rec.onstop = () => {
        if (!alive.current) return;
        const blob = new Blob(chunks, { type: rec.mimeType });
        if (blob.size) {
          setTake(blob);
          savedPath.current = null;
          setPhase("review");
        } else {
          setError("Nenhum áudio foi capturado. Verifique o microfone.");
          setPhase("idle");
        }
      };
      rec.onstart = () => {
        if (!alive.current) {
          stop();
          return;
        }
        setTake(null);
        setCaptionText("");
        setElapsed(0);
        playback.seek(start);
        playback.play();
        setPhase("recording");
        timer.current = setTimeout(() => {
          stop();
          playback.seek(end);
        }, duration * 1000);
      };
      rec.start(200);
    } catch (err) {
      stream.current?.getTracks().forEach((t) => {
        t.stop();
      });
      if (alive.current) {
        setError(`Não foi possível gravar: ${(err as Error).message}`);
        setPhase(take ? "review" : "idle");
      }
    }
  }

  async function accept() {
    if (!take) return;
    setPhase("saving");
    setError("");
    try {
      const path =
        savedPath.current ??
        (await window.api.saveNarration(new Uint8Array(await take.arrayBuffer())));
      savedPath.current = path;
      const info = await window.api.probe(path);
      if (!alive.current) return;
      const asset = {
        ...info,
        id: newId("a"),
        name: `Narração ${timecode(start, fps)}`,
        path,
        proxyStatus: "none" as const,
      };
      useProject.getState().commit((p) => insertNarration(p, projectId, asset, start, end));
      void window.api
        .waveform(path)
        .then((waveform) => {
          if (useProject.getState().project?.id === projectId)
            useProject.getState().patchAsset(asset.id, { waveform });
        })
        .catch(() => {});
      close();
    } catch (err) {
      if (alive.current) {
        setError((err as Error).message);
        setPhase("review");
      }
    }
  }

  const busy = phase === "preparing" || phase === "saving";
  return createPortal(
    <div className="narration-shield">
      <section
        className="narration-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Narrar intervalo"
      >
        <strong>Narrar intervalo</strong>
        <span>
          {timecode(start, fps)} → {timecode(end, fps)} · {timecode(duration, fps)}
        </span>
        <p>
          Grave enquanto acompanha a prévia. Use fones para evitar que o som da aula entre no
          microfone.
        </p>
        <label>
          Microfone{" "}
          <select
            disabled={busy || phase === "recording"}
            value={device}
            onChange={(e) => setDevice(e.target.value)}
          >
            <option value="">Padrão do sistema</option>
            {devices
              .filter((d) => d.deviceId !== "default")
              .map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microfone ${i + 1}`}
                </option>
              ))}
          </select>
        </label>
        {phase === "recording" && (
          <div role="status">
            ● Gravando · {timecode(elapsed, fps)} / {timecode(duration, fps)}
          </div>
        )}
        {busy && (
          <div role="status">
            {phase === "preparing" ? "Abrindo microfone…" : "Salvando narração…"}
          </div>
        )}
        {url && (
          <>
            <PreviewMedia kind="audio" controls src={url} label="Ouvir tomada" cues={takeCues} />
            <label>
              Texto da tomada (opcional, para acompanhar a prévia)
              <textarea
                value={captionText}
                maxLength={8192}
                onChange={(event) => setCaptionText(event.target.value)}
              />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="narration-actions">
          <button type="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
          {phase === "recording" ? (
            <button type="button" onClick={stop}>
              Parar
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void record()}>
              {take ? "Refazer" : "Gravar intervalo"}
            </button>
          )}
          {take && (
            <button type="button" disabled={busy} onClick={() => void accept()}>
              Inserir narração
            </button>
          )}
        </div>
        <small>
          A voz será inserida no início do intervalo, em uma nova faixa. O áudio existente será
          mantido.
        </small>
      </section>
    </div>,
    document.body,
  );
}
