import { timelineWords } from "@shared/cleanup";
import { clipEnd } from "@shared/timeline";
import { voiceClips } from "@shared/voiceMaster";
import { FileAudio, UserRound } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { timecode } from "@/lib/format";
import { replaceSpeech } from "@/lib/speechSwap";
import { loadProjectTranscripts } from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Button, Modal, Toggle } from "@/ui";

const fileName = (path: string): string => path.split(/[\\/]/).at(-1) ?? path;

/**
 * "Trocar uma fala": the stretch marked on the ruler is the old line; the new line's audio (and
 * its presenter video, when there is one) takes its place on every track (lib/speechSwap.ts).
 */
export function SpeechSwapDialog(): ReactNode {
  const range = useApp((s) => s.speechSwap);
  const project = useProject((s) => s.project);
  const [voicePath, setVoicePath] = useState<string | null>(null);
  const [presenterPath, setPresenterPath] = useState<string | null>(null);
  const [rerecord, setRerecord] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const start = range?.start ?? 0;
  const end = range?.end ?? 0;
  // The words said in the stretch now, so the person sees it is the right line.
  useEffect(() => {
    const p = useProject.getState().project;
    if (!p) return;
    let alive = true;
    void loadProjectTranscripts(p)
      .then((transcripts) => {
        const voice = new Set(voiceClips(p).map((c) => c.id));
        const words = timelineWords(p, transcripts).filter(
          (w) => voice.has(w.clipId) && w.end > start + 0.05 && w.start < end - 0.05,
        );
        if (alive) setSaid(words.length ? words.map((w) => w.text).join(" ") : null);
      })
      .catch(() => alive && setSaid(null));
    return () => {
      alive = false;
    };
  }, [start, end]);
  if (!project || !range) return null;
  const fps = project.settings.fps;
  const close = (): void => {
    if (!busy) useApp.getState().set({ speechSwap: null });
  };
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const hadPresenter = project.clips.some(
    (c) =>
      assets.get(c.assetId)?.origin === "presenter" &&
      assets.get(c.assetId)?.kind === "video" &&
      c.start < end &&
      clipEnd(c) > start,
  );
  const apply = async (): Promise<void> => {
    if (!voicePath || busy) return;
    setBusy(true);
    setError("");
    try {
      const problem = await replaceSpeech({
        start,
        end,
        voicePath,
        ...(presenterPath ? { presenterPath } : {}),
        rerecord,
      });
      if (problem) setError(problem);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal label="Trocar uma fala" onClose={close} width={520}>
      <div className="modal-body speed-body">
        <h2 className="modal-title">Trocar uma fala</h2>
        <p>
          A fala de <strong className="mono">{timecode(start, fps)}</strong> a{" "}
          <strong className="mono">{timecode(end, fps)}</strong> sai de todas as faixas e a fala
          nova entra no lugar dela. O resto da aula anda junto, se a nova for mais curta ou mais
          longa.
        </p>
        {said && <p className="muted">Fala de agora: “{said}”</p>}
        <div className="props-head">
          <span className="field-label">Áudio novo da fala</span>
          <Button
            icon={FileAudio}
            disabled={busy}
            onClick={() =>
              void window.api.pickVoiceFiles().then(([path]) => path && setVoicePath(path))
            }
          >
            {voicePath ? "Trocar o arquivo" : "Escolher…"}
          </Button>
        </div>
        {voicePath && <p className="muted">{fileName(voicePath)}</p>}
        <div className="props-head">
          <span className="field-label">Vídeo novo do apresentador (opcional)</span>
          <Button
            icon={UserRound}
            disabled={busy}
            onClick={() =>
              void window.api.pickPresenterVideos().then(([path]) => path && setPresenterPath(path))
            }
          >
            {presenterPath ? "Trocar o arquivo" : "Escolher…"}
          </Button>
        </div>
        <p className="muted">
          {presenterPath
            ? `${fileName(presenterPath)}: entra onde o apresentador estava, encaixado pelo som, com o fundo removido.`
            : hadPresenter
              ? "Sem o vídeo novo, o apresentador some durante a fala nova."
              : "Gerou um vídeo do apresentador só com essa fala? Escolha aqui."}
        </p>
        <div className="props-head">
          <span className="field-label">Regravar a tela desse trecho logo depois</span>
          <Toggle
            on={rerecord}
            onChange={setRerecord}
            label="Regravar a tela desse trecho logo depois"
          />
        </div>
        <p className="muted">
          {rerecord
            ? "O gravador abre com a fala nova tocando nos fones, e só esse trecho da tela é gravado."
            : "A tela fica parada no último quadro antes da fala. Dá para gravar depois com Regravar a tela neste intervalo."}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <Button onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!voicePath || busy} onClick={() => void apply()}>
            {busy ? "Trocando…" : "Trocar a fala"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
