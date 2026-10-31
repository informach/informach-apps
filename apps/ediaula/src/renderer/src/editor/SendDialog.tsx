import { plural } from "@shared/plural";
import { newId } from "@shared/timeline";
import { voiceClips } from "@shared/voiceMaster";
import { AlertTriangle, CheckCircle2, FolderOpen, Info, PackageCheck } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useScreenCoverage } from "@/lib/coverage";
import { bytes } from "@/lib/format";
import { openRecorder } from "@/lib/recording";
import { cleanError } from "@/lib/transcripts";
import { usePresenterReview } from "@/lib/voice";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Modal, Toggle } from "@/ui";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Estimate = Awaited<ReturnType<typeof window.api.packEstimate>>;

/** The package's name: "Curso, Aula" (or the lesson's name alone, without a course). */
const packageName = (name: string, course?: string): string =>
  (course?.trim() ? `${course.trim()}, ${name}` : name).replace(/[<>:"/\\|?*]/g, "").trim() ||
  "Aula";

/**
 * "Enviar para a edição": what is still missing in the lesson (lines without a screen, media
 * gone, the voice not read yet), the package with only what the lesson uses, and the folder it
 * goes to (a cloud-synced one sends it on by itself).
 */
export function SendDialog(): ReactNode {
  const project = useProject((s) => s.project);
  const guesses = usePresenterReview((s) => s.items);
  const coverage = useScreenCoverage(project);
  const [onlyUsed, setOnlyUsed] = useState(true);
  const [folder, setFolder] = useState<string | null | undefined>(undefined);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = (): void => useApp.getState().set({ sendOpen: false });
  const keep = useMemo(() => guesses.map((g) => g.assetId), [guesses]);
  const projectJson = useMemo(() => (project ? JSON.stringify(project) : ""), [project]);

  useEffect(() => {
    void window.api.sendSettings().then((s) => setFolder(s.folder));
  }, []);
  useEffect(() => {
    if (!projectJson) return;
    let alive = true;
    setEstimate(null);
    window.api
      .packEstimate(projectJson, { onlyUsed, keep })
      .then((e) => alive && setEstimate(e))
      .catch((err: unknown) => alive && setError(cleanError(err)));
    return () => {
      alive = false;
    };
  }, [projectJson, onlyUsed, keep]);
  if (!project) return null;

  const missingLines = coverage?.lines.filter((l) => l.status !== "done") ?? [];
  const gap = coverage?.firstGap ?? null;
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const voiceUnread = [...new Set(voiceClips(project).map((c) => c.assetId))].some(
    (id) => assets.get(id)?.transcriptStatus !== "ready",
  );
  const missingMedia = estimate?.missing ?? [];
  const goTo = (t: number): void => {
    close();
    playback.pause();
    playback.seek(t);
  };
  const record = (from: number, to: number): void => {
    close();
    void openRecorder({ mode: "over", from, to, replace: true });
  };
  const pickFolder = async (): Promise<void> => {
    const picked = await window.api.pickSendFolder();
    if (picked) setFolder(picked);
  };
  const send = async (): Promise<void> => {
    const { startJob, endJob, toast } = useApp.getState();
    if (!(await useProject.getState().saveNow())) {
      setError("Salve a aula antes de enviar.");
      return;
    }
    const current = useProject.getState().project ?? project;
    const jobId = newId("pack");
    setBusy(true);
    setError(null);
    startJob(jobId, `Empacotando: ${current.name}`);
    try {
      const done = await window.api.packProject(
        jobId,
        JSON.stringify(current),
        packageName(current.name, current.course),
        { onlyUsed, keep, toSendFolder: !!folder },
      );
      if (!done) return;
      setSent(done.path);
      if (done.droppedVoices)
        toast(
          plural(
            done.droppedVoices,
            "voz exportada para o vídeo do apresentador ficou fora do pacote, porque os arquivos dela não estão mais no computador.",
            "vozes exportadas para o vídeo do apresentador ficaram fora do pacote, porque os arquivos delas não estão mais no computador.",
          ),
          "info",
        );
    } catch (err) {
      setError(`A aula não foi empacotada: ${cleanError(err)}`);
    } finally {
      endJob(jobId);
      setBusy(false);
    }
  };

  return (
    <Modal label="Enviar para a edição" onClose={close} width={600}>
      <div className="modal-body stack-16">
        <div className="modal-title-row">
          <PackageCheck size={18} color="var(--accent)" />
          <h2 className="modal-title">Enviar para a edição</h2>
        </div>
        {sent ? (
          <>
            <p className="send-done">
              <CheckCircle2 size={16} className="accent" /> Aula empacotada em {sent}.
            </p>
            <p className="muted">
              {folder
                ? "Numa pasta sincronizada com a nuvem, o pacote chega a quem edita assim que terminar de subir. Quem edita abre o .zip com Abrir aula empacotada."
                : "Mande o .zip para quem edita. Lá, ele abre com Abrir aula empacotada."}
            </p>
            <div className="modal-actions">
              <Button icon={FolderOpen} onClick={() => void window.api.showInFolder(sent)}>
                Mostrar na pasta
              </Button>
              <Button variant="primary" onClick={close}>
                Pronto
              </Button>
            </div>
          </>
        ) : (
          <>
            <section className="send-checks" aria-label="Conferência">
              <h3>Conferência</h3>
              <ul>
                {missingLines.length > 0 ? (
                  <li className="send-check is-warn">
                    <AlertTriangle size={14} className="send-icon" />
                    <div>
                      {plural(missingLines.length, "fala ainda sem tela", "falas ainda sem tela")}.
                      <ul className="send-lines">
                        {missingLines.slice(0, 6).map((l) => (
                          <li className="send-line" key={`${l.t}-${l.text}`}>
                            <span className="mono">{clock(l.t)}</span>
                            <span className="send-line-text">{l.text}</span>
                            <Button size="sm" onClick={() => goTo(l.t)}>
                              Ir até
                            </Button>
                            <Button size="sm" onClick={() => record(l.t, l.end)}>
                              Gravar este trecho
                            </Button>
                          </li>
                        ))}
                      </ul>
                      {missingLines.length > 6 && (
                        <small className="muted">
                          E mais {plural(missingLines.length - 6, "fala", "falas")}: veja no painel
                          Etapas.
                        </small>
                      )}
                    </div>
                  </li>
                ) : gap !== null ? (
                  <li className="send-check is-warn">
                    <AlertTriangle size={14} className="send-icon" />
                    <span>
                      A voz em {clock(gap)} ainda está sem tela.{" "}
                      <Button size="sm" onClick={() => goTo(gap)}>
                        Ir até
                      </Button>
                    </span>
                  </li>
                ) : coverage ? (
                  <li className="send-check is-ok">
                    <CheckCircle2 size={14} className="send-icon" /> Toda a voz tem tela gravada.
                  </li>
                ) : (
                  <li className="send-check is-warn">
                    <AlertTriangle size={14} className="send-icon" /> A aula ainda não tem voz.
                  </li>
                )}
                {missingMedia.length > 0 && (
                  <li className="send-check is-error">
                    <AlertTriangle size={14} className="send-icon" />
                    <span>
                      {plural(missingMedia.length, "arquivo sumiu", "arquivos sumiram")} do
                      computador ({missingMedia.slice(0, 3).join(", ")}
                      {missingMedia.length > 3 ? "…" : ""}). Reconecte na Mídia antes de enviar.
                    </span>
                  </li>
                )}
                {voiceUnread && coverage && (
                  <li className="send-check is-info">
                    <Info size={14} className="send-icon" />
                    <span>
                      A voz não está toda transcrita. Quem edita pode transcrever lá, mas leva mais
                      tempo.
                    </span>
                  </li>
                )}
              </ul>
            </section>

            <section className="send-pack" aria-label="Pacote">
              <h3>Pacote</h3>
              <div className="audio-flag">
                <span>
                  Levar só o que a aula usa
                  <small className="muted">
                    {" "}
                    (os takes gravados por cima e as mídias fora da timeline ficam de fora)
                  </small>
                </span>
                <Toggle on={onlyUsed} onChange={setOnlyUsed} label="Levar só o que a aula usa" />
              </div>
              <p className="muted">
                {estimate
                  ? `${plural(estimate.files, "arquivo", "arquivos")}, ${bytes(estimate.bytes)}.${
                      onlyUsed && estimate.leftOut.files
                        ? ` Ficam de fora ${plural(estimate.leftOut.files, "arquivo", "arquivos")} (${bytes(estimate.leftOut.bytes)}).`
                        : ""
                    }`
                  : "Calculando o tamanho…"}
              </p>
            </section>

            <section className="send-folder" aria-label="Pasta de envio">
              <h3>Pasta de envio</h3>
              <p className={folder ? "mono send-path" : "muted"}>
                {folder === undefined
                  ? "…"
                  : (folder ?? "Nenhuma pasta escolhida: o app pergunta onde salvar a cada envio.")}
              </p>
              <p className="muted">
                Uma pasta sincronizada com a nuvem envia sozinha (por exemplo, a do Drive ou do
                OneDrive no computador). O pacote sai com o nome do curso e da aula.
              </p>
              <Button size="sm" icon={FolderOpen} onClick={() => void pickFolder()}>
                {folder ? "Trocar pasta" : "Escolher pasta"}
              </Button>
            </section>

            {error && (
              <p className="send-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button onClick={close}>Cancelar</Button>
              <Button
                variant="primary"
                icon={PackageCheck}
                disabled={busy || missingMedia.length > 0}
                onClick={() => void send()}
              >
                {busy ? "Empacotando…" : folder ? "Empacotar e enviar" : "Empacotar e salvar…"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
