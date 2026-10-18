import type { TakeMark } from "@shared/guidedNarration";
import { insertNarration } from "@shared/narration";
import { newId } from "@shared/timeline";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { timecode } from "@/lib/format";
import { type NarrationScript, narrationScript, placeGuidedNarration } from "@/lib/guidedNarration";
import { treatVoices } from "@/lib/voice";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { PreviewMedia } from "@/ui/PreviewMedia";
import "./narration.css";

/**
 * The guided take joins the lesson with its draft: once the draft is applied, the take gets the
 * same treatment as the recorded voice; a draft thrown away ends the wait.
 */
function treatWhenApplied(projectId: string, assetId: string): void {
  const stop = useProject.subscribe((s) => {
    if (s.project?.id !== projectId) {
      stop();
      return;
    }
    if (s.project.assets.some((a) => a.id === assetId)) {
      stop();
      void treatVoices([assetId], "teacher");
    } else if (!s.draft) stop();
  });
}

/** PCM in WebM when this Chromium writes it, otherwise Opus at 256 kb/s. */
function narrationFormat(): MediaRecorderOptions {
  const pcm = "audio/webm;codecs=pcm";
  return MediaRecorder.isTypeSupported(pcm)
    ? { mimeType: pcm }
    : { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 256000 };
}

/** The microphone saved in the recorder's options, among the ones this window sees. */
function savedMicrophone(list: MediaDeviceInfo[], saved: string | null): string {
  if (!saved) return "";
  const name = saved.toLowerCase();
  const found = list.find(
    (d) =>
      d.deviceId !== "default" &&
      d.label &&
      (d.label.toLowerCase() === name ||
        d.label.toLowerCase().includes(name) ||
        name.includes(d.label.toLowerCase())),
  );
  return found?.deviceId ?? "";
}

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
  // Guided by the script: the lines of the stretch, the one on screen and when each began.
  const [script, setScript] = useState<NarrationScript | null>(null);
  const [guided, setGuided] = useState(true);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const marks = useRef<TakeMark[]>([]);
  const takeStarted = useRef(0);
  useEffect(() => {
    const p = useProject.getState().project;
    if (!p || p.id !== projectId) return;
    let alive = true;
    void narrationScript(p, start, end).then(
      (s) => alive && setScript(s),
      () => alive && setScript(null),
    );
    return () => {
      alive = false;
    };
  }, [projectId, start, end]);
  const following = guided && !!script?.lines.length;
  /** The next line of the teleprompter: its take starts now. */
  const nextLine = useCallback(() => {
    if (!script || phase !== "recording") return;
    const n = Math.min(script.lines.length - 1, currentRef.current + 1);
    if (n === currentRef.current) return;
    const line = script.lines[n];
    marks.current.push({
      item: line.item,
      text: line.text,
      mark: (performance.now() - takeStarted.current) / 1000,
    });
    currentRef.current = n;
    setCurrent(n);
  }, [script, phase]);
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
    void Promise.all([
      navigator.mediaDevices.enumerateDevices(),
      window.api.recorder.settings().then(
        (s) => s.microphone,
        () => null,
      ),
    ])
      .then(([list, saved]) => {
        if (!alive.current) return;
        const inputs = list.filter((d) => d.kind === "audioinput");
        setDevices(inputs);
        // The recorder's microphone comes first, unless one was already picked here.
        setDevice((current) => current || savedMicrophone(inputs, saved));
      })
      .catch((err: unknown) => {
        if (alive.current)
          setError(`Não foi possível listar os microfones: ${(err as Error).message}`);
      });
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
      // The voice as the microphone hears it: no echo cancelling, noise suppression or
      // automatic gain (they flatten a voice), mono at 48 kHz like the recorder's voice.
      const input = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(device ? { deviceId: { exact: device } } : {}),
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
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
      const rec = new MediaRecorder(input, narrationFormat());
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
        takeStarted.current = performance.now();
        currentRef.current = 0;
        setCurrent(0);
        marks.current = script?.lines.length
          ? [{ item: script.lines[0].item, text: script.lines[0].text, mark: 0 }]
          : [];
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
      if (following && script && marks.current.length) {
        // Each line where it belongs on the screen, as a draft to review.
        const message = await placeGuidedNarration({
          projectId,
          asset,
          start,
          marks: [...marks.current],
          anchors: script.anchors,
        });
        useApp.getState().toast(message, "info");
        treatWhenApplied(projectId, asset.id);
        close();
        return;
      }
      useProject.getState().commit((p) => insertNarration(p, projectId, asset, start, end));
      // The same treatment as the recorded voice, when this computer has it.
      void treatVoices([asset.id], "teacher");
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
        {script?.lines.length ? (
          <label className="narration-guided">
            <input
              type="checkbox"
              checked={guided}
              disabled={phase === "recording" || busy}
              onChange={(e) => setGuided(e.target.checked)}
            />
            Seguir o roteiro:{" "}
            {script.lines.length === 1 ? "1 fala" : `${script.lines.length} falas`} deste trecho,
            cada uma encaixada no momento da tela dela
          </label>
        ) : null}
        {following && script && (
          <div className="narration-prompter" aria-live="polite">
            {script.lines.map((l, i) => (
              <p
                key={`${l.item}`}
                className={i === current ? "is-current" : i < current ? "is-done" : undefined}
              >
                <span className="narration-speaker">{l.speaker}</span> {l.text}
              </p>
            ))}
          </div>
        )}
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
          {phase === "recording" && following && script && current < script.lines.length - 1 && (
            <button type="button" onClick={nextLine}>
              Próxima fala
            </button>
          )}
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
          {following
            ? "Cada fala entra como rascunho na faixa Narração, no momento da tela dela. O áudio existente é mantido."
            : "A voz entra no início do intervalo, na faixa Narração (uma nova só quando a de antes está ocupada ali). O áudio existente é mantido."}
        </small>
      </section>
    </div>,
    document.body,
  );
}
