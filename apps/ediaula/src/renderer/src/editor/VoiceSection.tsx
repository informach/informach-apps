import { agree, plural } from "@shared/plural";
import type { VoiceMaster } from "@shared/types";
import {
  treatedPath,
  VOICE_PRESET_LABELS,
  VOICE_PRESETS,
  type VoicePreset,
} from "@shared/voiceChain";
import { masterIsStale, PIECE_MINUTES, pieceSeconds, voiceClips } from "@shared/voiceMaster";
import {
  Download,
  Loader,
  Mic,
  MonitorPlay,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { leaveField, typedNumber } from "@/lib/fieldText";
import { openRecorder } from "@/lib/recording";
import {
  acceptGuess,
  dropGuess,
  exportVoiceFiles,
  importPresenterVideos,
  proposeVoiceCleanup,
  setPieceMinutes,
  treatVoices,
  usePresenterReview,
  useVoiceListen,
  voiceTargets,
} from "@/lib/voice";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Toggle } from "@/ui";

const SCOPES: { id: VoiceMaster["scope"]; label: string }[] = [
  { id: "lesson", label: "Aula inteira" },
  { id: "section", label: "Por seção do roteiro" },
  { id: "insert", label: "Por inserção do avatar" },
];

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * The voice in the audio panel: its treatment with A/B, the cleanup before the presenter's video,
 * the export of the voice to make it with any tool, the import of the videos that come back, and
 * recording the screen over the voice.
 */
export function VoiceSection(): ReactNode {
  const project = useProject((s) => s.project);
  const selection = useProject((s) => s.selection);
  const original = useVoiceListen((s) => s.original);
  const [scope, setScope] = useState<VoiceMaster["scope"]>("lesson");
  const [useSound, setUseSound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!project) return null;
  const targets = voiceTargets(project, selection);
  const presets = new Set(targets.map((a) => a.voicePreset ?? "off"));
  const preset: VoicePreset = presets.size === 1 ? [...presets][0] : "teacher";
  const treating = targets.some((a) => a.treatStatus === "pending");
  const ready = targets.filter((a) => treatedPath(a)).length;
  const hasVoice = voiceClips(project).length > 0;
  const master = project.voiceMasters?.at(-1);
  const stale = master ? masterIsStale(project, master) : false;
  const minutes = pieceSeconds(project) / 60;
  const run = async (label: string, work: () => Promise<unknown>): Promise<void> => {
    setBusy(label);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };
  const ids = targets.map((a) => a.id);
  return (
    <>
      <div className="props-section">
        <h3>
          <Mic size={13} /> Voz
        </h3>
        <p className="props-hint muted">
          {targets.length
            ? `${selection.length ? "Selecionado" : "Faixa Voz"}: ${targets.map((a) => a.name).join(", ")}.`
            : "Selecione um clipe com som, ou grave a voz no modo Só voz."}
        </p>
        <label className="tpl-field">
          <span className="field-label">Tratamento</span>
          <select
            className="select"
            value={preset}
            disabled={!targets.length}
            onChange={(e) => {
              const next = VOICE_PRESETS.find((p) => p === e.target.value);
              if (next) void treatVoices(ids, next);
            }}
          >
            {VOICE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {VOICE_PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <Button
          icon={treating ? Loader : Wand2}
          disabled={!targets.length || treating}
          onClick={() => void treatVoices(ids, preset === "off" ? "teacher" : preset)}
        >
          {treating ? "Tratando a voz…" : "Tratar a voz"}
        </Button>
        <p className="props-hint muted">
          Tira o ruído, suaviza o "s", nivela a voz e deixa em -16 LUFS. A prévia e a exportação
          tocam o mesmo arquivo tratado.
          {targets.length
            ? ` ${ready} de ${targets.length} ${agree(targets.length, "pronta", "prontas")}.`
            : ""}
        </p>
        <div className="audio-flag" title="Compare a voz antes e depois do tratamento na prévia">
          <small className="muted">Ouvir o original</small>
          <Toggle
            on={original}
            onChange={(v) => useVoiceListen.setState({ original: v })}
            label="Ouvir o original"
          />
        </div>
      </div>
      <div className="props-section">
        <h3>
          <UserRound size={13} /> Vídeo do apresentador
        </h3>
        <p className="props-hint muted">
          Funciona com qualquer ferramenta de avatar ou com a sua câmera.
        </p>
        <Button
          icon={Sparkles}
          disabled={!hasVoice || !!busy}
          onClick={() =>
            void run("limpar", async () => {
              const msg = await proposeVoiceCleanup();
              useApp.getState().toast(msg.split("\n")[0], "info");
            })
          }
        >
          {busy === "limpar" ? "Montando a proposta…" : "Limpar a voz antes de exportar"}
        </Button>
        <p className="props-hint muted">
          Uma proposta só: tomadas repetidas (fica a última completa), trechos marcados para
          refazer, vícios de fala e silêncios longos. Aplicar desfaz com um Ctrl+Z.
        </p>
        <label className="tpl-field">
          <span className="field-label">Exportar</span>
          <select
            className="select"
            value={scope}
            onChange={(e) => {
              const next = SCOPES.find((s) => s.id === e.target.value);
              if (next) setScope(next.id);
            }}
          >
            {SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="tpl-field voice-split">
          <span className="field-label" aria-hidden="true">
            Dividir a voz em partes de até
          </span>
          <span className="voice-split-row">
            <PieceMinutesField minutes={minutes} />
            <span>min</span>
          </span>
        </div>
        <p className="props-hint muted" id="voice-split-hint">
          Algumas ferramentas de avatar limitam o tamanho do arquivo.
        </p>
        <Button
          icon={Download}
          disabled={!hasVoice || !!busy}
          onClick={() => void run("exportar", () => exportVoiceFiles(scope))}
        >
          {busy === "exportar" ? "Exportando…" : "Exportar a voz"}
        </Button>
        <p className="props-hint muted">
          Para gerar o vídeo do apresentador. Os arquivos vão para a pasta Voz exportada, ao lado do
          projeto.
          {master
            ? ` Última exportação: ${plural(master.pieces.length, "arquivo", "arquivos")}, ${new Date(master.createdAt).toLocaleString("pt-BR")}.`
            : ""}
          {stale
            ? " A voz mudou depois disso: o vídeo que voltar segue os cortes, mas confira os trechos que mudaram."
            : ""}
        </p>
        <Button
          icon={Upload}
          disabled={!hasVoice || !!busy}
          title="Também serve para gravar a câmera depois, ouvindo a própria voz: o vídeo encaixa pela voz."
          onClick={() => void run("importar", () => importPresenterVideos(useSound))}
        >
          {busy === "importar" ? "Encaixando…" : "Importar vídeo do apresentador"}
        </Button>
        <p className="props-hint muted">O app encaixa o vídeo pela voz.</p>
        <div className="audio-flag" title="Por padrão o vídeo entra mudo e vale a voz tratada">
          <small className="muted">Usar o som do vídeo importado</small>
          <Toggle on={useSound} onChange={setUseSound} label="Usar o som do vídeo importado" />
        </div>
      </div>
      <div className="props-section">
        <h3>
          <MonitorPlay size={13} /> Tela sobre a narração
        </h3>
        <p className="props-hint muted">
          A voz da aula toca nos fones a partir do cursor da timeline enquanto você grava a tela.
          Para trocar só um trecho, marque o intervalo na régua da timeline e use Regravar a tela.
        </p>
        <Button
          icon={MonitorPlay}
          disabled={!hasVoice}
          onClick={() => void openRecorder({ mode: "over" })}
        >
          Gravar a tela sobre a narração
        </Button>
      </div>
    </>
  );
}

/**
 * The longest piece of the exported voice: typed freely and kept in the lesson (one undo step)
 * when the field is left or Enter is pressed; Esc puts the value back.
 */
function PieceMinutesField({ minutes }: { minutes: number }): ReactNode {
  const [text, setText] = useState<string | null>(null);
  // Esc blurs the field right after asking for the value back: the blur must see it at once.
  const cancelled = useRef(false);
  const shown = String(minutes);
  const leave = (): void => {
    const result = leaveField(text, shown, cancelled.current, typedNumber);
    cancelled.current = false;
    setText(null);
    if (result.kind === "commit" && result.value > 0) setPieceMinutes(result.value);
  };
  return (
    <input
      className="input"
      inputMode="numeric"
      value={text ?? shown}
      aria-label="Dividir a voz em partes de até (minutos)"
      aria-describedby="voice-split-hint"
      title={`De ${PIECE_MINUTES.min} a ${PIECE_MINUTES.max} minutos`}
      onFocus={(e) => {
        cancelled.current = false;
        setText(shown);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={leave}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Doubtful presenter matches, each with its best guess for the person to check. */
function ReviewBar(): ReactNode {
  const items = usePresenterReview((s) => s.items);
  const assets = useProject((s) => s.project?.assets);
  const shown = items.filter((g) => assets?.some((a) => a.id === g.assetId));
  if (!shown.length) return null;
  return (
    <div className="proposal">
      {shown.map((g) => (
        <div key={g.id} className="proposal-head">
          <Sparkles size={14} className="accent" />
          <span>
            Encaixe incerto de <strong>{g.name}</strong> ({g.why}):{" "}
            {g.at !== null
              ? `o melhor palpite começa em ${clock(g.at)}. Confira antes de encaixar.`
              : "não achou lugar na voz atual."}
          </span>
          {g.at !== null && (
            <Button size="sm" onClick={() => playback.seek(g.at ?? 0)}>
              Ir para lá
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={g.at === null}
            onClick={() => acceptGuess(g.id)}
          >
            Encaixar aqui
          </Button>
          <Button size="sm" onClick={() => dropGuess(g.id)}>
            Descartar
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Mounted once in the editor: the review of doubtful presenter placements. */
export function PresenterDialogs(): ReactNode {
  return <ReviewBar />;
}
