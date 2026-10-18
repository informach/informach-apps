import type { OrphanTake } from "@shared/recording";
import { AlertTriangle, FolderOpen, Loader, RotateCcw, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { importRecording } from "@/lib/recording";
import { useApp } from "@/state/app";
import { Button, Modal } from "@/ui";

const SOURCE_NAMES: Record<OrphanTake["sources"][number], string> = {
  screen: "tela",
  mic: "microfone",
  camera: "câmera",
  system: "áudio do PC",
};

const list = (items: string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items.at(-1)}` : (items[0] ?? "");

function describe(take: OrphanTake): string {
  const when = new Date(take.startedAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const minutes =
    take.seconds >= 90 ? `cerca de ${Math.round(take.seconds / 60)} min` : `${take.seconds} s`;
  const size =
    take.size >= 1024 ** 3
      ? `${(take.size / 1024 ** 3).toFixed(1).replace(".", ",")} GB`
      : `${Math.max(1, Math.round(take.size / 1024 ** 2))} MB`;
  return `${when.replace(",", " às")} · ${minutes} · ${list(take.sources.map((s) => SOURCE_NAMES[s]))} · ${size}`;
}

/**
 * Takes the app did not finish (it or the computer went down while recording), offered when the
 * editor opens: recover and import, show the folder, or send them to the Recycle Bin.
 */
export function OrphanRecordings(): ReactNode {
  const [takes, setTakes] = useState<OrphanTake[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const toast = useApp((s) => s.toast);
  const look = useCallback(
    (): Promise<void> =>
      window.api.recorder.orphans().then(
        (found) => {
          setTakes(found);
          setClosed(false);
        },
        (error: unknown) =>
          toast(
            `Não consegui procurar gravações interrompidas: ${(error as Error).message}`,
            "error",
          ),
      ),
    [toast],
  );
  useEffect(() => {
    void look();
    // A take that did not finish (or a recorder that went down) is said here and offered now.
    return window.api.recorder.onAlert((alert) => {
      toast(alert.message, alert.orphans ? "error" : "info");
      if (alert.orphans) void look();
    });
  }, [look, toast]);
  if (!takes.length || closed) return null;
  const done = (dir: string): void => setTakes((all) => all.filter((t) => t.dir !== dir));
  const act = async (dir: string, work: () => Promise<void>): Promise<void> => {
    setBusy(dir);
    try {
      await work();
    } catch (error) {
      toast(
        (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""),
        "error",
      );
    } finally {
      setBusy(null);
    }
  };
  const recover = (take: OrphanTake): Promise<void> =>
    act(take.dir, async () => {
      const result = await window.api.recorder.recoverOrphan(take.dir);
      done(take.dir);
      await importRecording(result);
    });
  const discard = (take: OrphanTake): Promise<void> =>
    act(take.dir, async () => {
      if (!window.confirm(`Mandar a gravação de ${describe(take)} para a Lixeira?`)) return;
      await window.api.recorder.discardOrphan(take.dir);
      done(take.dir);
    });
  const plural = takes.length > 1;
  const interrupted = takes.some((t) => !t.finalized);
  return (
    <Modal label="Gravação interrompida" width={640} onClose={() => setClosed(true)}>
      <div className="export-head">
        <AlertTriangle size={20} className="warn-icon" />
        <div className="spacer">
          <h2 className="modal-title">
            {interrupted
              ? plural
                ? "Gravações interrompidas"
                : "Gravação interrompida"
              : plural
                ? "Gravações que não entraram no projeto"
                : "Gravação que não entrou no projeto"}
          </h2>
          <p className="muted">
            {interrupted
              ? "Algumas gravações não chegaram ao fim. O vídeo, o som e o cursor ficaram na pasta: dá para recuperar e importar no projeto."
              : "Estas gravações terminaram, mas não chegaram a entrar num projeto. Dá para importar agora."}
          </p>
        </div>
      </div>
      <div className="modal-body orphan-list">
        {takes.map((take) => (
          <article key={take.dir} className="export-queue-item">
            <div className="row-10">
              <strong className="spacer">{describe(take)}</strong>
              {busy === take.dir && <Loader size={14} className="spin" />}
            </div>
            <p className="muted path mono">{take.dir}</p>
            <div className="row-10">
              <Button
                size="sm"
                variant="primary"
                icon={RotateCcw}
                disabled={busy !== null}
                onClick={() => void recover(take)}
              >
                {take.finalized ? "Importar" : "Recuperar e importar"}
              </Button>
              <Button
                size="sm"
                icon={FolderOpen}
                disabled={busy !== null}
                onClick={() => void window.api.showInFolder(take.dir)}
              >
                Mostrar pasta
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                disabled={busy !== null}
                onClick={() => void discard(take)}
              >
                Descartar
              </Button>
            </div>
          </article>
        ))}
      </div>
      <div className="export-foot">
        <span className="muted spacer">Elas continuam na pasta até você decidir.</span>
        <Button disabled={busy !== null} onClick={() => setClosed(true)}>
          Decidir depois
        </Button>
      </div>
    </Modal>
  );
}
