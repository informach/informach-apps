import { newId, projectDuration } from "@shared/timeline";
import type { ExportSpec } from "@shared/types";
import {
  AudioLines,
  Captions,
  GraduationCap,
  HardDrive,
  Image,
  type LucideIcon,
  MonitorPlay,
  Smartphone,
  Timer,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { bytes, duration } from "@/lib/format";
import { needsRelink, reconnectMissing } from "@/lib/relink";
import { useApp } from "@/state/app";
import { exportQueue, useExportQueue } from "@/state/exportQueue";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Field, IconButton, Modal, Toggle } from "@/ui";
import { setCaptions as setCaptionStyle } from "./CaptionSettings";

interface Preset {
  id: string;
  icon: LucideIcon;
  name: string;
  desc: string;
  height: number;
  bitrate: number;
  soon?: boolean;
}

const PRESETS: Preset[] = [
  {
    id: "youtube",
    icon: MonitorPlay,
    name: "YouTube",
    desc: "1080p · alta qualidade",
    height: 1080,
    bitrate: 12000,
  },
  {
    id: "hotmart",
    icon: GraduationCap,
    name: "Hotmart / área de membros",
    desc: "1080p · arquivo menor",
    height: 1080,
    bitrate: 8000,
  },
  {
    id: "draft",
    icon: Zap,
    name: "Rascunho para revisão",
    desc: "720p · rápido e leve",
    height: 720,
    bitrate: 3500,
  },
  {
    id: "reels",
    icon: Smartphone,
    name: "Reels / Shorts 9:16",
    desc: "1080 × 1920 · vertical",
    height: 1080,
    bitrate: 10000,
  },
  {
    id: "audio",
    icon: AudioLines,
    name: "Só áudio (podcast)",
    desc: "MP3 · 192 kbps",
    height: 1080,
    bitrate: 0,
  },
];

const QUALITY: [string, number][] = [
  ["Rascunho", 3500],
  ["Padrão", 8000],
  ["Alta", 12000],
  ["Máxima", 20000],
];

type Phase = { kind: "setup" } | { kind: "error"; message: string };

export function ExportDialog(): ReactNode {
  const project = useProject((s) => s.project)!;
  const info = useApp((s) => s.info);
  const close = (): void => {
    useApp.getState().set({ exportOpen: false });
  };
  const [preset, setPreset] = useState("youtube");
  const [height, setHeight] = useState(Math.min(1080, project.settings.height));
  const [bitrate, setBitrate] = useState(12000);
  const [normalize, setNormalize] = useState(true);
  const transcribed = project.assets.filter((a) => a.transcript && a.transcriptStatus === "ready");
  const [captions, setCaptions] = useState(true);
  const [thumbnail, setThumbnail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [vertical, setVertical] = useState<"blur" | "crop">("blur");
  const isReels = preset === "reels";
  const isAudio = preset === "audio";

  const total = projectDuration(project);
  const ratio = project.settings.width / project.settings.height;
  const even = (v: number): number => Math.round(v / 2) * 2;
  const width = even(height * ratio);
  const sizeEstimate = (((isAudio ? 0 : bitrate) + 192) * 1000 * total) / 8;
  // Same list the export refuses (state/exportQueue.ts): missing files and missing cursor data.
  const missing = project.assets.filter(
    (a) => (a.missing || a.cursorMissing) && project.clips.some((c) => c.assetId === a.id),
  );
  const toFind = missing.filter(needsRelink).length;

  useEffect(() => playback.pause(), []);

  const choose = (p: Preset): void => {
    if (p.soon) return;
    setPreset(p.id);
    setHeight(Math.min(p.height, project.settings.height));
    setBitrate(p.bitrate);
  };

  const start = async (): Promise<void> => {
    const safe = project.name.replace(/[<>:"/\\|?*]/g, "").trim() || "aula";
    const outPath = await window.api.pickExportPath(
      `${safe}${isReels ? " (vertical)" : ""}.${isAudio ? "mp3" : "mp4"}`,
    );
    if (!outPath) return;
    const spec: ExportSpec = isReels
      ? {
          outPath,
          width: 1080,
          height: 1920,
          fps: project.settings.fps,
          videoBitrate: bitrate,
          normalizeLoudness: normalize,
          encoder: info?.encoder ?? "x264",
          thumbnail,
          vertical,
        }
      : {
          outPath,
          width,
          height: even(height),
          fps: project.settings.fps,
          videoBitrate: bitrate,
          normalizeLoudness: normalize,
          encoder: info?.encoder ?? "x264",
          thumbnail,
          audioOnly: isAudio,
        };
    exportQueue.add({ id: newId("export"), project, spec, captions });
    close();
    useExportQueue.setState({ open: true });
  };

  const enqueue = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await start();
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal label="Exportar aula" onClose={() => !submitting && close()} width={1000}>
      <div className="export-head">
        <Upload size={18} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">Exportar aula</h2>
          <p className="muted">
            {project.course ? `${project.course} / ` : ""}
            {project.name} · {duration(total)}
          </p>
        </div>
        {!submitting && <IconButton icon={X} label="Fechar" onClick={close} />}
      </div>

      {phase.kind === "setup" && (
        <div className="export-body">
          <div className="presets">
            <span className="section-label">PRESETS</span>
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`preset ${preset === p.id ? "is-active" : ""}`}
                disabled={p.soon}
                onClick={() => choose(p)}
              >
                <span className="preset-icon">
                  <p.icon size={16} />
                </span>
                <span className="preset-text">
                  <strong>{p.name}</strong>
                  <span>{p.desc}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="export-settings">
            {isReels && (
              <>
                <span className="section-label">VERTICAL</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={vertical === "blur" ? "is-active" : ""}
                    onClick={() => setVertical("blur")}
                  >
                    <strong>Aula inteira</strong>
                    <span>sobre fundo desfocado</span>
                  </button>
                  <button
                    type="button"
                    className={vertical === "crop" ? "is-active" : ""}
                    onClick={() => setVertical("crop")}
                  >
                    <strong>Preencher</strong>
                    <span>corta as laterais</span>
                  </button>
                </div>
              </>
            )}
            {!isAudio && <span className="section-label">VÍDEO</span>}
            {!isAudio && !isReels && (
              <div className="grid-2">
                <Field label="Resolução">
                  <select
                    className="select"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                  >
                    {[2160, 1440, 1080, 720]
                      .filter((h) => h <= project.settings.height)
                      .map((h) => (
                        <option key={h} value={h}>
                          {even(h * ratio)} × {h}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Codificador">
                  <div className="static-field">
                    H.264 ·{" "}
                    {info?.encoder === "nvenc" ? (
                      <span className="accent">GPU NVENC</span>
                    ) : (
                      "CPU (x264)"
                    )}
                  </div>
                </Field>
              </div>
            )}
            {!isAudio && (
              <Field label="Qualidade">
                <div className="segmented">
                  {QUALITY.map(([label, kbps]) => (
                    <button
                      type="button"
                      key={label}
                      className={bitrate === kbps ? "is-active" : ""}
                      onClick={() => setBitrate(kbps)}
                    >
                      <strong>{label}</strong>
                      <span className="mono">{kbps / 1000} Mbps</span>
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <div className="loudness">
              <AudioLines size={15} className="accent" />
              <div className="spacer">
                <strong>Normalizar volume para −14 LUFS</strong>
                <p className="muted">
                  Padrão do YouTube e do Spotify: todas as aulas ficam no mesmo volume.
                </p>
              </div>
              <Toggle on={normalize} onChange={setNormalize} label="Normalizar volume" />
            </div>
            {transcribed.length > 0 && !isAudio && (
              <div className="loudness">
                <Captions size={15} className="accent" />
                <div className="spacer">
                  <strong>Legenda dentro do vídeo</strong>
                  <p className="muted">
                    Estilo e posição em Propriedades (com nada selecionado). Recomendado para Reels
                    e Shorts.
                  </p>
                </div>
                <Toggle
                  on={!!project.captions?.burn}
                  onChange={(v) => setCaptionStyle({ burn: v })}
                  label="Gravar legenda no vídeo"
                />
              </div>
            )}
            {transcribed.length > 0 && (
              <div className="loudness">
                <Captions size={15} className="accent" />
                <div className="spacer">
                  <strong>Legendas .srt e .vtt junto com o vídeo</strong>
                  <p className="muted">
                    Gerada da transcrição já editada. YouTube e Hotmart aceitam o arquivo direto.
                  </p>
                </div>
                <Toggle on={captions} onChange={setCaptions} label="Gerar legenda" />
              </div>
            )}
            {!isAudio && (
              <div className="loudness">
                <Image size={15} className="accent" />
                <div className="spacer">
                  <strong>Miniatura (.jpg)</strong>
                  <p className="muted">
                    Um quadro de 1280 px salvo ao lado do vídeo, para a capa da aula.
                  </p>
                </div>
                <Toggle on={thumbnail} onChange={setThumbnail} label="Gerar miniatura" />
              </div>
            )}
            {missing.length > 0 && (
              <div className="export-warning">
                <p>
                  {missing.length === 1
                    ? "1 arquivo usado na timeline não foi encontrado"
                    : `${missing.length} arquivos usados na timeline não foram encontrados`}
                  : {missing.map((a) => a.name).join(", ")}.{" "}
                  {toFind
                    ? "Reconecte antes de exportar."
                    : "São imagens do próprio editor: dá para desenhar de novo."}
                </p>
                <Button size="sm" onClick={() => void reconnectMissing()}>
                  {toFind === 0
                    ? "Desenhar de novo"
                    : toFind === 1
                      ? "Reconectar…"
                      : "Procurar em uma pasta…"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="export-progress">
          <strong className="error-title">A exportação falhou</strong>
          <pre className="error-box">{phase.message}</pre>
        </div>
      )}

      <div className="export-foot">
        {phase.kind === "setup" && (
          <>
            <span className="stat">
              <HardDrive size={14} /> ≈ {bytes(sizeEstimate)}
            </span>
            <span className="stat">
              <Timer size={14} /> {duration(total)} de vídeo
            </span>
            <span className="spacer" />
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={Upload}
              onClick={() => void enqueue()}
              disabled={submitting || total <= 0 || missing.length > 0}
            >
              {submitting ? "Adicionando?" : "Adicionar ? fila"}
            </Button>
          </>
        )}
        {phase.kind === "error" && (
          <>
            <span className="spacer" />
            <Button variant="secondary" onClick={() => setPhase({ kind: "setup" })}>
              Voltar
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
