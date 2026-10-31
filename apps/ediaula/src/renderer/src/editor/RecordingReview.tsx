import { retryAt } from "@shared/attempts";
import { lessonNotes, noteText } from "@shared/markers";
import { defaultSpace, lapseChoice } from "@shared/timelapse";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { confirmRecordingReview } from "@/lib/prepare";
import { applyLapse } from "@/lib/timelapse";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button } from "@/ui";
import { swapRetry } from "./RetrySection";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const times = (v: number): string => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×`;

const CHOICE = { under: "sob a fala", space: "com espaço na voz", cut: "tempo extra cortado" };

/**
 * "Revisar a gravação" in Preparar aula: what the recording left to decide, in one place. The
 * screen recorded with the voice held (under the line, room in the voice or cut), the earlier
 * attempts of "Errei, voltar" (the last one is in; the earlier one comes back with a click) and
 * the notes left while recording.
 */
export function RecordingReview(): ReactNode {
  const project = useProject((s) => s.project);
  if (!project) return null;
  const lapses = project.clips.filter((c) => c.timelapse).sort((a, b) => a.start - b.start);
  const used = new Set(project.clips.map((c) => c.assetId));
  const retries = project.assets.flatMap((a) =>
    used.has(a.id) ? (a.retries ?? []).map((r, i) => ({ asset: a, r, i })) : [],
  );
  const notes = lessonNotes(project);
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  return (
    <div className="recording-review">
      {lapses.length > 0 && (
        <section>
          <h4>Tela sem voz</h4>
          <ul>
            {lapses.map((c) => {
              const t = c.timelapse;
              if (!t) return null;
              const kind = lapseChoice(t).kind;
              const off = locked.has(c.trackId);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className="link mono"
                    onClick={() => playback.seek(c.start)}
                  >
                    {clock(c.start)}
                  </button>
                  <span>
                    {CHOICE[kind]}
                    {c.speed ? `, ${times(c.speed)}` : ""}
                  </span>
                  <span className="row-6">
                    <Button
                      size="sm"
                      disabled={off || kind === "under"}
                      onClick={() => applyLapse(c.id, { kind: "under" })}
                    >
                      Sob a fala
                    </Button>
                    <Button
                      size="sm"
                      disabled={off || defaultSpace(t) < 1}
                      onClick={() => applyLapse(c.id, { kind: "space", seconds: defaultSpace(t) })}
                    >
                      Abrir {defaultSpace(t)} s
                    </Button>
                    <Button
                      size="sm"
                      disabled={off || kind === "cut"}
                      onClick={() => applyLapse(c.id, { kind: "cut" })}
                    >
                      Cortar o extra
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {retries.length > 0 && (
        <section>
          <h4>Tentativas (Errei, voltar)</h4>
          <ul>
            {retries.map(({ asset, r, i }) => {
              const at = retryAt(project, asset.id, r);
              return (
                <li key={`${asset.id}-${r.earlier[0]}-${r.later}`}>
                  <button
                    type="button"
                    className="link mono"
                    disabled={at === null}
                    onClick={() => at !== null && playback.seek(at)}
                  >
                    {at === null ? "fora" : clock(at)}
                  </button>
                  <span>{r.using === "earlier" ? "ficou a anterior" : "ficou a última"}</span>
                  <Button size="sm" disabled={at === null} onClick={() => swapRetry(asset.id, i)}>
                    {r.using === "earlier" ? "Voltar à última" : "Usar a anterior"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {notes.length > 0 && (
        <section>
          <h4>Lembretes</h4>
          <ul>
            {notes.map((m) => (
              <li key={m.id}>
                <button type="button" className="link mono" onClick={() => playback.seek(m.t)}>
                  {clock(m.t)}
                </button>
                <span>{noteText(m)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button size="sm" variant="primary" icon={Check} onClick={confirmRecordingReview}>
        Pronto
      </Button>
    </div>
  );
}
