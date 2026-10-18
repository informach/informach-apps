import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { type ScriptItem, type SpeechItem, sectionLabel, speechSeconds } from "@shared/script";
import { CONFIRM_COVERAGE } from "@shared/scriptAlign";
import { projectDuration } from "@shared/timeline";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  FileText,
  HelpCircle,
  Layers,
  Loader,
  Monitor,
  Scissors,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { duration as fmtDuration } from "@/lib/format";
import {
  insertedClip,
  pendingInserts,
  placeInsert,
  placeInserts,
  proposeOffScript,
  setScript,
  useScriptView,
} from "@/lib/script";
import { useTranscripts } from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button } from "@/ui";

const percent = (share: number): string => `${Math.round(share * 100)}%`;

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ScriptPanel(): ReactNode {
  const project = useProject((s) => s.project);
  const transcripts = useTranscripts(project);
  const view = useScriptView(project, transcripts);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useApp((s) => s.toast);
  if (!project) return null;

  if (!project.script) {
    return (
      <div className="script-empty">
        <FileText size={26} className="accent" />
        <strong>Cole o roteiro desta aula</strong>
        <p className="muted">
          A EdiAula separa a narração das notas <em>Na tela</em> e das falas do Zappy que não são
          gravadas, acha cada fala na gravação, mostra o que ficou de fora e encaixa as entradas do
          avatar.
        </p>
        <textarea
          className="script-paste"
          placeholder={'# Roteiro de gravação · …\n## Seção 1. …\n**Professora:**\n> "…"'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="row-6">
          <Button
            variant="secondary"
            icon={ClipboardPaste}
            onClick={async () => {
              const text = await navigator.clipboard.readText();
              if (text.trim()) setScript(text);
            }}
          >
            Colar da área de transferência
          </Button>
          <Button variant="primary" disabled={!draft.trim()} onClick={() => setScript(draft)}>
            Usar roteiro
          </Button>
        </div>
      </div>
    );
  }

  if (!view)
    return (
      <div className="script-empty muted">
        Não reconheci seções neste roteiro (títulos “## Seção 1. …”).
      </div>
    );

  const { doc, index, section, alignment, rank, confirmed } = view;
  const scriptText = project.script.text;
  const total = projectDuration(project);
  const target = section.target;
  const narration = speechSeconds(section, doc.wordsPerMinute ?? 137);
  const transcribed = view.words.length > 0;
  const offSeconds = alignment.offScript.reduce((s, r) => s + (r.end - r.start), 0);
  const lineOf = (idx: number) => alignment.lines.find((l) => l.item === idx);
  const durTone = !target
    ? ""
    : total < target[0] - 0.5
      ? "is-under"
      : total > target[1] + 0.5
        ? "is-over"
        : "is-ok";

  const place = async (item: SpeechItem): Promise<void> => {
    setBusy(item.insertId ?? item.text);
    const r = await placeInsert(item);
    setBusy(null);
    toast(r.message, r.ok ? "success" : "error");
  };
  const waiting = pendingInserts(project, section);
  const placeAll = async (): Promise<void> => {
    setBusy("all");
    const r = await placeInserts("all");
    setBusy(null);
    toast(r.message, r.ok ? "success" : "error");
  };
  // The best other section, to name it when the choice is close.
  const runnerUp = rank
    ? rank.scores.reduce(
        (best, s, i) => (i !== index && (best < 0 || s > rank.scores[best]) ? i : best),
        -1,
      )
    : -1;

  return (
    <div className="script">
      <div className="script-head">
        <span className="muted script-title">{doc.title || "Roteiro"}</span>
        <select
          className="select"
          value={index}
          onChange={(e) => setScript(scriptText, Number(e.target.value))}
          title={
            project.script.section === undefined
              ? "Escolhida automaticamente pela gravação"
              : "Escolhida por você"
          }
        >
          {doc.sections.map((s, i) => (
            <option key={`${s.videoId ?? s.number}:${s.title}`} value={i}>
              {sectionLabel(s)}
            </option>
          ))}
        </select>
        <div className="script-stats">
          {target && (
            <span
              className={`script-target ${durTone}`}
              title={`Narração estimada: ${fmtDuration(narration)} a ${doc.wordsPerMinute ?? 137} palavras/min`}
            >
              Alvo {section.targetText?.replace(/\.$/, "") ?? `${target[0]}–${target[1]} s`} · agora{" "}
              {fmtDuration(total)}
              {durTone === "is-under" ? " · curto" : durTone === "is-over" ? " · longo" : " ✓"}
            </span>
          )}
          {section.videoId && <span className="mono muted">{section.videoId}</span>}
        </div>
        {transcribed && !confirmed && (
          <div className="script-confirm" role="status">
            <HelpCircle size={14} />
            <span>
              Esta gravação parece ser da {sectionLabel(section)},{" "}
              {rank && rank.coverage >= CONFIRM_COVERAGE && runnerUp >= 0
                ? `mas a ${sectionLabel(doc.sections[runnerUp])} combina quase o mesmo (${percent(rank.coverage)} e ${percent(rank.scores[runnerUp])} das palavras).`
                : `mas só achei ${percent(rank?.coverage ?? 0)} das palavras dela.`}{" "}
              É esta mesma? Se não for, escolha a seção certa na lista acima.
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon={Check}
              onClick={() => setScript(scriptText, index)}
            >
              É esta
            </Button>
          </div>
        )}
        {transcribed ? (
          <div className="script-coverage">
            <span>
              Narração encontrada: <strong>{Math.round(alignment.coverage * 100)}%</strong>
            </span>
            {alignment.offScript.length > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                icon={Scissors}
                disabled={!confirmed}
                title={
                  confirmed
                    ? "Propor o corte do que foi falado fora do roteiro"
                    : "Confirme a seção antes de propor cortes"
                }
                onClick={async () => {
                  const msg = await proposeOffScript();
                  toast(msg.split("\n")[0], "info");
                }}
              >
                {alignment.offScript.length} fora do roteiro ({offSeconds.toFixed(1)} s)
              </Button>
            ) : (
              <span className="muted">
                <Check size={12} /> nada fora do roteiro
              </span>
            )}
          </div>
        ) : (
          <div className="script-coverage muted">
            <Sparkles size={13} /> Transcreva a narração para alinhar com o roteiro.
            <Button
              size="sm"
              variant="ghost"
              onClick={() => useApp.getState().set({ sideTab: "transcript" })}
            >
              Transcrever
            </Button>
          </div>
        )}
      </div>

      {transcribed && waiting.length > 1 && (
        <div className="script-batch">
          <Button
            size="sm"
            variant="secondary"
            icon={busy === "all" ? Loader : Layers}
            disabled={busy !== null}
            onClick={() => void placeAll()}
          >
            Encaixar todas ({waiting.length})
          </Button>
          <span className="muted">
            Coloca cada fala do avatar depois da fala anterior, de uma vez só. Ctrl+Z desfaz tudo.
          </span>
        </div>
      )}

      <div className="script-items">
        {withRenderKeys(section.items, (item) => JSON.stringify(item)).map(
          ({ key, value: it }, idx) => (
            <Item
              key={key}
              item={it}
              line={lineOf(idx)}
              transcribed={transcribed}
              placed={
                it.kind === "speech" && it.insertId ? insertedClip(project, it.insertId) : undefined
              }
              busy={busy}
              onPlace={place}
            />
          ),
        )}
      </div>

      <div className="script-foot">
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          onClick={() => {
            if (confirm("Tirar o roteiro deste projeto? A edição não muda.")) setScript(null);
          }}
        >
          Tirar roteiro
        </Button>
      </div>
    </div>
  );
}

function Item({
  item,
  line,
  transcribed,
  placed,
  busy,
  onPlace,
}: {
  item: ScriptItem;
  line?: { matched: number; total: number; start?: number; end?: number };
  transcribed: boolean;
  placed?: { start: number };
  busy: string | null;
  onPlace: (i: SpeechItem) => void;
}): ReactNode {
  const now = usePlayback((s) =>
    line?.start !== undefined && line.end !== undefined
      ? s.time >= line.start && s.time < line.end
      : false,
  );

  if (item.kind === "screen")
    return (
      <div className="si si-screen">
        <Monitor size={12} />
        <span>
          {item.insertId && <span className="insert-chip">{item.insertId}</span>}
          {item.text}
        </span>
      </div>
    );
  if (item.kind === "bridge")
    return (
      <details className="si si-bridge">
        <summary>Zappy na página · não gravar</summary>
        <p>{item.text}</p>
      </details>
    );
  if (item.kind === "note")
    return (
      <details className="si si-note">
        <summary>{item.label || "Nota"}</summary>
        <p>{item.text}</p>
      </details>
    );

  const ratio = line ? line.matched / Math.max(1, line.total) : 0;
  const status = !transcribed ? "none" : ratio >= 0.8 ? "ok" : ratio >= 0.4 ? "partial" : "missing";
  const at = placed?.start ?? (status !== "missing" ? line?.start : undefined);
  return (
    <div
      className={`si si-speech ${item.avatar ? "is-avatar" : ""} ${now ? "is-now" : ""}`}
      style={{ position: "relative" }}
    >
      {at !== undefined && (
        <button
          type="button"
          className="card-open"
          aria-label={`Ir para ${clock(at)}: ${item.text}`}
          onClick={() => playback.seek(at)}
        />
      )}
      <div className="si-top">
        <span className={`speaker ${item.avatar ? "is-avatar" : ""}`}>{item.speaker}</span>
        {item.insertId && <span className="insert-chip">{item.insertId}</span>}
        <span className="spacer" />
        {at !== undefined && <span className="mono si-time">{clock(at)}</span>}
        {item.avatar && !placed && status !== "ok" ? (
          <Button
            style={{ position: "relative", zIndex: 2 }}
            size="sm"
            variant="secondary"
            icon={busy === (item.insertId ?? item.text) ? Loader : Wand2}
            disabled={busy !== null || !transcribed}
            onClick={(e) => {
              e.stopPropagation();
              onPlace(item);
            }}
          >
            Encaixar
          </Button>
        ) : status === "ok" || placed ? (
          <Check size={13} className="si-ok" />
        ) : status === "partial" ? (
          <span className="si-warn" title="Parte das palavras não foi encontrada na gravação">
            <AlertTriangle size={12} /> {Math.round(ratio * 100)}%
          </span>
        ) : status === "missing" ? (
          <span className="si-miss">não gravada</span>
        ) : null}
      </div>
      <p>{item.text}</p>
    </div>
  );
}
