import { plural } from "@shared/plural";
import { dbfs, type RecorderHealth, SILENCE_DBFS } from "@shared/recordingHealth";
import { AlertTriangle, HardDrive, MousePointer2 } from "lucide-react";
import type { ReactNode } from "react";

/** Level each bar lights at, in dBFS: -60 to 0 across the row, like a mixer. */
const BARS = Array.from({ length: 14 }, (_, i) => -60 + ((i + 1) * 60) / 14);

/** Microphone level as a row of bars; `peak` is 0..1. */
export function LevelBars({ peak, quiet }: { peak: number; quiet?: boolean }): ReactNode {
  const db = dbfs(peak);
  return (
    <span className={`rec-meter ${quiet ? "is-quiet" : ""}`} aria-hidden="true">
      {BARS.map((level) => (
        <i key={level} className={db >= level ? (level > -9 ? "is-hot" : "is-on") : ""} />
      ))}
    </span>
  );
}

const minutes = (m: number): string =>
  m >= 120 ? `${Math.floor(m / 60)} h` : `${Math.floor(m)} min`;

/**
 * The take's health in the pill: microphone level, disk time left, frames lost when there are
 * any, the cursor when it is not well, and the warning that matters most.
 */
export function HealthStrip({ health }: { health: RecorderHealth | null }): ReactNode {
  if (!health) return null;
  const quiet = !!health.mic && dbfs(health.mic.rms) < SILENCE_DBFS;
  const warning = health.warnings[0];
  return (
    <span className="rec-health">
      {health.mic && (
        <span
          title={
            quiet ? `Microfone em silêncio há ${Math.floor(health.mic.silentFor)} s` : "Microfone"
          }
        >
          <LevelBars peak={health.mic.peak} quiet={quiet} />
        </span>
      )}
      {health.disk.minutesLeft !== null && (
        <span
          className={health.disk.minutesLeft < 10 ? "rec-health-warn" : ""}
          title={`${(health.disk.free / 1024 ** 3).toFixed(1).replace(".", ",")} GB livres`}
        >
          <HardDrive size={13} /> {minutes(health.disk.minutesLeft)}
        </span>
      )}
      {health.frames && health.frames.lost > 0 && (
        <span className="rec-health-warn" title="Quadros que o codificador não conseguiu gravar">
          {plural(health.frames.lost, "quadro perdido", "quadros perdidos")}
        </span>
      )}
      {health.cursor !== "ok" && health.cursor !== "none" && (
        <span className="rec-health-warn">
          <MousePointer2 size={13} />{" "}
          {health.cursor === "lost" ? "sem cursor" : "reiniciando cursor"}
        </span>
      )}
      {warning && (
        <span className="rec-health-warn" title={health.warnings.join("\n")}>
          <AlertTriangle size={13} /> {warning}
        </span>
      )}
    </span>
  );
}
