import { lapseChoice, maxSpace } from "@shared/timelapse";
import type { Clip } from "@shared/types";
import { FastForward } from "lucide-react";
import { type ReactNode, useState } from "react";
import { duration } from "@/lib/format";
import { applyLapse } from "@/lib/timelapse";
import { Button } from "@/ui";

const times = (v: number): string => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×`;

/**
 * "Tela sem voz" in the clip's properties: a screen recorded while the voice was held, and what
 * it becomes (under the line, room in the voice, or only the line's time).
 */
export function LapseSection({ clip, locked }: { clip: Clip; locked: boolean }): ReactNode {
  const t = clip.timelapse;
  const current = t ? lapseChoice(t) : null;
  const [seconds, setSeconds] = useState(
    current?.kind === "space" ? current.seconds : Math.min(8, t ? maxSpace(t) : 8),
  );
  if (!t || !current) return null;
  const most = maxSpace(t);
  return (
    <div className="props-section">
      <h3>
        <FastForward size={13} /> Tela sem voz
      </h3>
      <p className="props-hint muted">
        Gravado em {duration(t.source)}, passa em {duration(clip.duration)}
        {clip.speed ? ` (${times(clip.speed)})` : ""}. A voz ficou segurada enquanto a tela seguia.
      </p>
      <fieldset className="lapse-choices" aria-label="O que fazer com a tela sem voz">
        <Button
          size="sm"
          variant={current.kind === "under" ? "primary" : "secondary"}
          aria-pressed={current.kind === "under"}
          disabled={locked}
          onClick={() => applyLapse(clip.id, { kind: "under" })}
        >
          Acelerar sob a fala ({times(t.source / t.under)})
        </Button>
        <div className="row-6">
          <Button
            size="sm"
            variant={current.kind === "space" ? "primary" : "secondary"}
            aria-pressed={current.kind === "space"}
            disabled={locked || most < 0.5}
            onClick={() => applyLapse(clip.id, { kind: "space", seconds })}
          >
            Abrir espaço na voz
          </Button>
          <input
            className="input lapse-seconds"
            type="number"
            min={1}
            max={Math.floor(most)}
            step={1}
            value={seconds}
            aria-label="Segundos que a voz espera"
            disabled={locked || most < 0.5}
            onChange={(e) => setSeconds(Number(e.target.value) || 0)}
          />
          <span className="muted">s</span>
        </div>
        <Button
          size="sm"
          variant={current.kind === "cut" ? "primary" : "secondary"}
          aria-pressed={current.kind === "cut"}
          disabled={locked}
          onClick={() => applyLapse(clip.id, { kind: "cut" })}
        >
          Cortar o tempo extra
        </Button>
      </fieldset>
      <p className="props-hint muted">
        Abrir espaço: a voz para depois da fala e a tela passa mais devagar. Cortar: fica só o que
        foi gravado enquanto a fala tocava.
      </p>
    </div>
  );
}
