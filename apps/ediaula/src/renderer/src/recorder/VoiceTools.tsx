import { withRenderKeys } from "@informach/edi-desktop/renderer";
import type { OverContext } from "@shared/recording";
import { type MicCheck, type MicLevel, micCheck } from "@shared/recordingHealth";
import { isUnrecorded, type PrompterLine } from "@shared/voiceTakes";
import { Gauge, Loader, ScrollText } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The recorder's voice tools: the large teleprompter of "Só voz", the speakers it reads, the
 * five-second microphone test, and the karaoke of "Tela sobre a narração".
 */

/** Which speakers the take reads (the Zappy's and "não gravar" lines never). */
export function SpeakerChips({
  speakers,
  on,
  toggle,
}: {
  speakers: { name: string; on: boolean }[];
  on: ReadonlySet<string>;
  toggle: (name: string) => void;
}): ReactNode {
  if (!speakers.length) return null;
  return (
    <fieldset className="vp-speakers" aria-label="Falas que você vai gravar">
      <small>Gravar as falas de</small>
      {speakers.map((s) => (
        <label key={s.name} className={on.has(s.name) ? "is-on" : ""}>
          <input type="checkbox" checked={on.has(s.name)} onChange={() => toggle(s.name)} />{" "}
          {s.name}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The script line to read now, large, with the one before and the next ones smaller. Lines of
 * speakers left out are not shown; a click on a line goes to it.
 */
export function VoicePrompter({
  lines,
  order,
  current,
  setCurrent,
  size,
  live,
  status,
  nextKey,
  retakeKey,
}: {
  lines: readonly PrompterLine[];
  order: readonly number[];
  current: number;
  setCurrent: (index: number) => void;
  size: number;
  live: boolean;
  status?: string;
  nextKey: string;
  retakeKey: string;
}): ReactNode {
  const at = order.indexOf(current);
  const shown = order.slice(Math.max(0, at - 1), Math.max(0, at) + 4);
  if (!order.length)
    return (
      <div className="vp">
        <p className="vp-empty">
          {lines.length
            ? "Escolha embaixo de quem são as falas que você vai gravar."
            : "Cole o roteiro na aba Roteiro do editor para ler as falas aqui. Dá para gravar sem ele também."}
        </p>
      </div>
    );
  return (
    <div className={`vp ${live ? "is-live" : ""}`}>
      <div className="vp-head">
        <ScrollText size={16} className="accent" />
        <span>
          Fala {Math.max(1, at + 1)} de {order.length} · {nextKey} próxima · {retakeKey} refazer
          esta tomada
        </span>
        {status && <small className="vp-status">{status}</small>}
      </div>
      <div className="vp-body" style={{ fontSize: size }}>
        {withRenderKeys(shown, (i) => String(i)).map(({ key, value: i }) => {
          const l = lines[i];
          return (
            <button
              type="button"
              key={key}
              className={`vp-line ${i === current ? "is-current" : i < current ? "is-done" : ""}`}
              onClick={() => setCurrent(i)}
            >
              <small>
                {l.speaker}
                {l.insertId ? ` · ${l.insertId}` : ""}
                {l.avatar ? " · avatar" : ""}
              </small>
              {l.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Speakers and their default choice, for lines that may be recorded. */
export const recordable = (lines: readonly PrompterLine[]): PrompterLine[] =>
  lines.filter((l) => !isUnrecorded(l));

/**
 * Five seconds of the setup meter: a moment of silence, then a sentence read aloud. Says the
 * room noise, the voice level and what to do (closer, farther, quieter room).
 */
export function MicTest({ level, device }: { level: MicLevel | null; device: string }): ReactNode {
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<MicCheck | null>(null);
  const readings = useRef<{ rms: number; peak: number }[]>([]);
  useEffect(() => {
    if (running && level && !level.error)
      readings.current.push({ rms: level.rms, peak: level.peak });
  }, [running, level]);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = setInterval(() => {
      const passed = (Date.now() - start) / 1000;
      setLeft(Math.max(0, Math.ceil(5 - passed)));
      if (passed >= 5) {
        clearInterval(id);
        setRunning(false);
        setResult(micCheck(readings.current));
      }
    }, 200);
    return () => clearInterval(id);
  }, [running]);
  return (
    <div className="mic-test">
      <button
        type="button"
        className="rec-icon mic-test-go"
        disabled={!device || running}
        title="Mede o ruído do ambiente e o volume da sua voz"
        onClick={() => {
          readings.current = [];
          setResult(null);
          setLeft(5);
          setRunning(true);
        }}
      >
        {running ? <Loader size={15} className="spin" /> : <Gauge size={15} />}
        {running ? ` ${left} s` : " Testar 5 s"}
      </button>
      {running && (
        <span className="mic-test-note">Fique um segundo em silêncio e depois leia uma frase.</span>
      )}
      {result && !running && (
        <span className={`mic-test-note ${result.ok ? "is-ok" : "is-bad"}`}>
          {result.advice}
          {Number.isFinite(result.voice)
            ? ` (voz ${Math.round(result.voice)} dB, ruído ${Math.round(result.noise)} dB)`
            : ""}
        </span>
      )}
    </div>
  );
}

/**
 * "Tela sobre a narração": the voice's words lighting up as they are heard, and the next "Na
 * tela" directions, so the teacher knows what to do on the screen. Without a transcript, the
 * script's lines and directions in order.
 */
export function KaraokePrompter({
  over,
  heard,
  lines,
  notes,
  size,
}: {
  over: OverContext;
  /** Timeline second being heard (null before the voice starts). */
  heard: number | null;
  lines: readonly PrompterLine[];
  notes: readonly { before: number; text: string }[];
  size: number;
}): ReactNode {
  const t = heard ?? over.from;
  const words = over.words;
  let at = words.findIndex((w) => w.end > t);
  if (at < 0) at = words.length;
  const from = Math.max(0, at - 12);
  const shown = words.slice(from, at + 28);
  const next = over.cues.filter((c) => c.t >= t - 2).slice(0, 2);
  return (
    <div className="vp is-live karaoke">
      <div className="vp-head">
        <ScrollText size={16} className="accent" />
        <span>
          Voz da aula
          {heard !== null
            ? ` · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`
            : ""}
          {over.to !== undefined
            ? ` · regravando até ${Math.floor(over.to / 60)}:${String(Math.floor(over.to % 60)).padStart(2, "0")}`
            : ""}
        </span>
      </div>
      {next.length > 0 && (
        <div className="karaoke-cues">
          {next.map((c, i) => (
            <p key={`${c.t}-${c.text}`} className={i === 0 && c.t <= t + 3 ? "is-now" : ""}>
              <strong>Na tela</strong> {c.text}
            </p>
          ))}
        </div>
      )}
      <div className="vp-body" style={{ fontSize: size }}>
        {words.length ? (
          <p className="karaoke-text">
            {shown.map((w, i) => {
              const index = from + i;
              return (
                <span
                  key={`${w.t}-${index}`}
                  className={index === at && w.t <= t ? "is-now" : index < at ? "is-said" : ""}
                >
                  {w.text}{" "}
                </span>
              );
            })}
          </p>
        ) : (
          <div>
            <p className="vp-empty">
              Sem transcrição da voz: transcreva a faixa Voz para as palavras acenderem aqui.
            </p>
            {withRenderKeys(lines, (line) => JSON.stringify(line)).map(({ key, value: l }, i) => (
              <p key={key} className="vp-line">
                {notes
                  .filter((n) => n.before === i)
                  .map((n) => (
                    <small key={n.text} className="karaoke-note">
                      Na tela: {n.text}
                    </small>
                  ))}
                {l.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
