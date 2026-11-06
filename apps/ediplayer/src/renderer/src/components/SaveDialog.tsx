import {
  audioCopyExtension,
  canCopy,
  type EditJob,
  editedName,
  estimateBytes,
  exportExtension,
  GIF_LONG,
  PRESETS,
  type PresetId,
} from "@shared/edit";
import { joinBlocker } from "@shared/media/compat";
import {
  clock,
  isPartRemoved,
  keptRanges,
  keptWithin,
  MIN_RANGE,
  normalizeRanges,
  piecesFromPoints,
  totalDuration,
} from "@shared/ranges";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatBytes } from "../lib/media";
import { fail, toast, useStore } from "../state/store";

/** Salvar: the format, what it costs (size, time, quality), then the person's own save dialog. */
export function SaveDialog() {
  const save = useStore((s) => s.save);
  const facts = useStore((s) => s.facts);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (save && d && !d.open) d.showModal();
    if (!save && d?.open) d.close();
  }, [save]);
  if (!save || !facts) return <dialog ref={ref} className="save" />;
  return (
    <dialog
      ref={ref}
      className="save"
      aria-label="Salvar resultado"
      onClose={() => useStore.setState({ save: null })}
    >
      {save.kind === "export" && <ExportBody initial={save.preset} marked={save.marked} />}
      {save.kind === "split" && <SplitBody />}
      {save.kind === "join" && <JoinBody initial={save.preset} />}
      {save.kind === "audio" && <AudioBody />}
    </dialog>
  );
}

const close = () => useStore.setState({ save: null });

function Header({ title }: { title: string }) {
  return (
    <div className="row">
      <h1 style={{ flex: 1 }}>{title}</h1>
      <button type="button" className="icon-btn" aria-label="Fechar" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}

function Footer({
  onSave,
  label,
  busy,
  openFolder,
  setOpenFolder,
}: {
  onSave: () => void;
  label: string;
  busy: boolean;
  openFolder: boolean;
  setOpenFolder: (v: boolean) => void;
}) {
  return (
    <div className="dialog-actions">
      <label className="check" style={{ flex: 1 }}>
        <input
          type="checkbox"
          checked={openFolder}
          onChange={(e) => setOpenFolder(e.target.checked)}
        />
        Abrir a pasta ao terminar
      </label>
      <button type="button" className="btn big" onClick={close}>
        Cancelar
      </button>
      <button type="button" className="btn primary big" disabled={busy} onClick={onSave}>
        {label}
      </button>
    </div>
  );
}

async function enqueue(job: EditJob, label: string, openFolder: boolean): Promise<void> {
  await window.api.enqueue(job, label, openFolder);
  close();
  toast("Na fila. Pode continuar assistindo enquanto salva.");
}

function ExportBody({ initial, marked }: { initial: PresetId; marked: boolean }) {
  const facts = useStore((s) => s.facts);
  const marks = useStore((s) => s.marks);
  const mode = useStore((s) => s.mode);
  const precise = useStore((s) => s.precise);
  const transform = useStore((s) => s.transform);
  const [preset, setPreset] = useState<PresetId>(initial);
  const [openFolder, setOpenFolder] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!facts) return null;
  // A GIF is the marked stretches themselves; anything else follows the cut mode.
  const ranges = marked
    ? normalizeRanges(marks, facts.duration)
    : keptRanges(marks, mode, facts.duration);
  const seconds = totalDuration(ranges) / transform.speed;
  const copy = canCopy(transform, preset, precise, facts);
  const codec = (facts.audio.at(transform.audioIndex) ?? facts.audio.at(0))?.codec ?? "";
  const ext = exportExtension(facts.path, preset, copy, facts.hasVideo, codec);
  const empty = ranges.length === 0;
  const bytes = estimateBytes(facts, seconds, preset, copy, transform.removeAudio);
  const presets = PRESETS.filter((p) => facts.hasVideo || ["original", "mp3"].includes(p.id));
  const run = async () => {
    setBusy(true);
    try {
      const output = await window.api.pickOutput(
        editedName(facts.name, preset === "original" ? "editado" : presetName(preset), ext),
        ext,
        facts.path,
      );
      if (!output) return;
      await enqueue(
        { kind: "export", source: facts.path, ranges, precise, transform, preset, output },
        "",
        openFolder,
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="save-body">
      <Header title="Salvar resultado" />
      <div className="field">
        Formato
        <div className="presets">
          {presets.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={preset === p.id}
              className={`preset${preset === p.id ? " on" : ""}`}
              onClick={() => setPreset(p.id)}
            >
              <strong className="row" style={{ gap: 6 }}>
                {preset === p.id && <Check size={15} color="var(--accent)" />}
                {p.name}
              </strong>
              <small>{p.id === "original" && !copy ? "Alta qualidade" : p.detail}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="summary">
        <div>
          <small>Duração</small>
          <span>{clock(seconds)}</span>
        </div>
        <div>
          <small>Tamanho</small>
          <span>≈ {formatBytes(bytes)}</span>
        </div>
        <div>
          <small>{copy ? "Qualidade" : "Tempo"}</small>
          <span>{copy ? "Idêntica" : seconds > 120 ? "Alguns minutos" : "Um minuto ou menos"}</span>
        </div>
      </div>
      {preset === "gif" && seconds > GIF_LONG && (
        <span className="warn">GIF de {clock(seconds)} fica pesado. Marque um trecho curto.</span>
      )}
      {empty && (
        <span className="warn">Nada sobrou para salvar: todos os trechos foram removidos.</span>
      )}
      {copy && !empty && (
        <span className="info">
          {facts.hasVideo
            ? "Sem recodificar a imagem: sai em segundos, com a mesma qualidade. O som é ajustado aos cortes."
            : "Sem recodificar: sai em segundos, com a mesma qualidade do original."}
        </span>
      )}
      <Footer
        onSave={() => void run()}
        label="Salvar…"
        busy={busy || empty}
        openFolder={openFolder}
        setOpenFolder={setOpenFolder}
      />
    </div>
  );
}

const presetName = (id: PresetId) => PRESETS.find((p) => p.id === id)?.name ?? id;

function SplitBody() {
  const facts = useStore((s) => s.facts);
  const points = useStore((s) => s.splitPoints);
  const marks = useStore((s) => s.marks);
  const mode = useStore((s) => s.mode);
  const [openFolder, setOpenFolder] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!facts) return null;
  // Deleted parts are left out; each part left is saved whole.
  const pieces = piecesFromPoints(points, facts.duration).filter(
    (p) => !isPartRemoved(p, marks, mode, facts.duration),
  );
  const trimmedInside = pieces.some(
    (p) => p.end - p.start - keptWithin(p, keptRanges(marks, mode, facts.duration)) >= MIN_RANGE,
  );
  const run = async () => {
    setBusy(true);
    try {
      const folder = await window.api.pickOutputFolder();
      if (!folder) return;
      await enqueue(
        {
          kind: "split",
          source: facts.path,
          pieces,
          folder,
          baseName: facts.name.replace(/\.[^.]+$/, ""),
        },
        "",
        openFolder,
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="save-body">
      <Header title={`Dividir em ${pieces.length} partes`} />
      <div className="list-mini">
        {pieces.map((p, i) => (
          <div key={p.start} className="li">
            <span>Parte {i + 1}</span>
            <span className="mono">
              {clock(p.start)} → {clock(p.end)}
            </span>
          </div>
        ))}
      </div>
      <span className="info">
        Sem recodificar a imagem: cada parte começa no quadro-chave anterior ao corte. Escolha a
        pasta onde salvar.
      </span>
      {trimmedInside && (
        <span className="warn">
          Os trechos marcados com I e O dentro de uma parte valem só para salvar o vídeo inteiro:
          aqui cada parte sai completa.
        </span>
      )}
      <Footer
        onSave={() => void run()}
        label="Escolher pasta…"
        busy={busy}
        openFolder={openFolder}
        setOpenFolder={setOpenFolder}
      />
    </div>
  );
}

function JoinBody({ initial }: { initial: PresetId }) {
  const facts = useStore((s) => s.facts);
  const files = useStore((s) => s.joinFiles);
  const [preset, setPreset] = useState<"original" | "youtube" | "whatsapp" | "email">(
    initial === "youtube" || initial === "whatsapp" || initial === "email" ? initial : "original",
  );
  const [openFolder, setOpenFolder] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!facts) return null;
  const all = [facts, ...files.filter((f) => f.path !== facts.path)];
  const blocker = joinBlocker(all);
  const copy = preset === "original" && !blocker;
  const ext = copy
    ? exportExtension(facts.path, "original", true)
    : all.every((f) => f.hasVideo)
      ? "mp4"
      : "mp3";
  const total = all.reduce((s, f) => s + f.duration, 0);
  const run = async () => {
    setBusy(true);
    try {
      const output = await window.api.pickOutput(
        editedName(facts.name, "junto", ext),
        ext,
        facts.path,
      );
      if (!output) return;
      await enqueue(
        { kind: "join", sources: all.map((f) => f.path), preset, output },
        "",
        openFolder,
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="save-body">
      <Header title={`Juntar ${all.length} arquivos`} />
      <div className="presets">
        {(["original", "youtube", "whatsapp", "email"] as const).map((id) => {
          const p = PRESETS.find((x) => x.id === id);
          return (
            <button
              type="button"
              key={id}
              aria-pressed={preset === id}
              className={`preset${preset === id ? " on" : ""}`}
              onClick={() => setPreset(id)}
            >
              <strong>{p?.name}</strong>
              <small>
                {id === "original"
                  ? blocker
                    ? "Converte em alta qualidade"
                    : "Sem perda, em segundos"
                  : p?.detail}
              </small>
            </button>
          );
        })}
      </div>
      <div className="summary">
        <div>
          <small>Duração</small>
          <span>{clock(total)}</span>
        </div>
        <div>
          <small>Arquivos</small>
          <span>{all.length}</span>
        </div>
        <div>
          <small>Modo</small>
          <span>{copy ? "Sem perda" : "Converter"}</span>
        </div>
      </div>
      {blocker && (
        <span className="warn">
          {blocker} Por isso os vídeos são convertidos para o tamanho do primeiro.
        </span>
      )}
      <Footer
        onSave={() => void run()}
        label="Salvar…"
        busy={busy}
        openFolder={openFolder}
        setOpenFolder={setOpenFolder}
      />
    </div>
  );
}

function AudioBody() {
  const facts = useStore((s) => s.facts);
  const marks = useStore((s) => s.marks);
  const mode = useStore((s) => s.mode);
  const source = useStore((s) => s.source);
  const [format, setFormat] = useState<"copy" | "mp3">("copy");
  const [openFolder, setOpenFolder] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!facts) return null;
  const audioIndex = Math.min(source?.audioIndex ?? 0, Math.max(0, facts.audio.length - 1));
  const codec = facts.audio.at(audioIndex)?.codec ?? "";
  const copyExt = audioCopyExtension(codec);
  const chosen = copyExt ? format : "mp3";
  const ext = chosen === "copy" && copyExt ? copyExt : "mp3";
  const ranges = keptRanges(marks, mode, facts.duration);
  const run = async () => {
    setBusy(true);
    try {
      const output = await window.api.pickOutput(
        editedName(facts.name, "som", ext),
        ext,
        facts.path,
      );
      if (!output) return;
      await enqueue(
        { kind: "audio", source: facts.path, ranges, audioIndex, format: chosen, output },
        "",
        openFolder,
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="save-body">
      <Header title="Extrair o som" />
      <div className="presets" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <button
          type="button"
          aria-pressed={chosen === "copy"}
          disabled={!copyExt}
          className={`preset${chosen === "copy" ? " on" : ""}`}
          onClick={() => setFormat("copy")}
        >
          <strong>Original</strong>
          <small>
            {copyExt ? `${codec.toUpperCase()} sem perda (.${copyExt})` : "Formato não suportado"}
          </small>
        </button>
        <button
          type="button"
          aria-pressed={chosen === "mp3"}
          className={`preset${chosen === "mp3" ? " on" : ""}`}
          onClick={() => setFormat("mp3")}
        >
          <strong>MP3</strong>
          <small>Abre em qualquer lugar</small>
        </button>
      </div>
      <span className="info">
        {marks.length
          ? `Só os trechos que ficam (${clock(totalDuration(ranges))}).`
          : `O som inteiro (${clock(facts.duration)}).`}
      </span>
      <Footer
        onSave={() => void run()}
        label="Salvar…"
        busy={busy}
        openFolder={openFolder}
        setOpenFolder={setOpenFolder}
      />
    </div>
  );
}
