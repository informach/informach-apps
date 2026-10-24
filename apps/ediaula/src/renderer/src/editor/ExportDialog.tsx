import { encoderName, isHardwareEncoder } from "@shared/encoderChoice";
import {
  EXPORT_PRESETS,
  EXPORT_QUALITY,
  type ExportPresetId,
  qualityOf,
} from "@shared/exportPresets";
import { withoutMissingCursors } from "@shared/preflight";
import { newId, projectDuration } from "@shared/timeline";
import type { ExportSpec } from "@shared/types";
import {
  AudioLines,
  Camera,
  Captions,
  FileJson,
  Gauge,
  GraduationCap,
  HardDrive,
  Image,
  Languages,
  type LucideIcon,
  MonitorPlay,
  Scissors,
  Smartphone,
  Timer,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { hasPlatformData, translationState } from "@/lib/delivery";
import { exportCurrentFrame } from "@/lib/exportExtras";
import { bytes, duration } from "@/lib/format";
import { kidsProject } from "@/lib/kids";
import {
  checkLesson,
  type LessonCheck,
  type MeasuredLoudness,
  measureLoudness,
} from "@/lib/preflight";
import { needsRelink, reconnectMissing } from "@/lib/relink";
import { cleanError } from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { exportQueue, useExportQueue } from "@/state/exportQueue";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Field, IconButton, Modal, Toggle } from "@/ui";
import { setCaptions as setCaptionStyle } from "./CaptionSettings";
import { PreflightList } from "./PreflightList";

type Preset = (typeof EXPORT_PRESETS)[number] & { icon: LucideIcon; soon?: boolean };

const ICONS: Record<ExportPresetId, LucideIcon> = {
  youtube: MonitorPlay,
  hotmart: GraduationCap,
  draft: Zap,
  reels: Smartphone,
  audio: AudioLines,
};
/** The presets of shared/exportPresets.ts (the AI's export_video uses the same ones). */
const PRESETS: Preset[] = EXPORT_PRESETS.map((p) => ({ ...p, icon: ICONS[p.id] }));
const QUALITY = EXPORT_QUALITY;

type Phase = { kind: "setup" } | { kind: "error"; message: string };

export function ExportDialog(): ReactNode {
  const project = useProject((s) => s.project)!;
  const draftWaiting = useProject((s) => !!s.draft && s.draft.projectId === s.project?.id);
  const info = useApp((s) => s.info);
  const close = (): void => {
    useApp.getState().set({ exportOpen: false });
  };
  const [preset, setPreset] = useState("youtube");
  // The resolution is the short side: 1080 is 1920 × 1080 for a lesson and 1080 × 1920 for Reels.
  const projectShort = Math.min(project.settings.width, project.settings.height);
  const portrait = project.settings.height > project.settings.width;
  const [short, setShort] = useState(Math.min(1080, projectShort));
  const [bitrate, setBitrate] = useState(12000);
  const [normalize, setNormalize] = useState(true);
  const transcribed = project.assets.filter((a) => a.transcript && a.transcriptStatus === "ready");
  const [captions, setCaptions] = useState(true);
  const [thumbnail, setThumbnail] = useState(true);
  // What goes to the platform beside the video: the translations up to date and the package.
  const [ready, setReady] = useState<{ current: string[]; stale: string[] }>({
    current: [],
    stale: [],
  });
  const [translations, setTranslations] = useState(true);
  const [platform, setPlatform] = useState(() => hasPlatformData(project));
  const revision = useProject((s) => s.revision);
  // Worked out again when the lesson changes (its revision), only when it has translations.
  const translated = !!project.captionTranslations?.length;
  useEffect(() => {
    if (!translated || revision < 0) {
      setReady({ current: [], stale: [] });
      return;
    }
    let alive = true;
    const now = useProject.getState().project;
    if (!now) return;
    void translationState(now).then(
      (list) =>
        alive &&
        setReady({
          current: list.filter((t) => !t.stale).map((t) => t.lang),
          stale: list.filter((t) => t.stale).map((t) => t.lang),
        }),
      () => alive && setReady({ current: [], stale: [] }),
    );
    return () => {
      alive = false;
    };
  }, [revision, translated]);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [vertical, setVertical] = useState<"blur" | "crop">("blur");
  const interval = useApp((s) => s.interval);
  const hasRange = !!interval && interval.end - interval.start > 0.1;
  const [onlyRange, setOnlyRange] = useState(false);
  const [stems, setStems] = useState(false);
  /** The kids edition goes out when the lesson has lines of its kids table placed. */
  const hasKids = !!project.kids?.pieces.length;
  const [edition, setEdition] = useState<"adult" | "kids">("adult");
  const kids = hasKids && edition === "kids";
  const isReels = preset === "reels";
  const isAudio = preset === "audio";
  // A lesson already vertical goes out in its own shape; the vertical layout is for wide ones.
  const relayout = isReels && !portrait;

  const lesson = projectDuration(project);
  // The interval is in the adult edition's seconds; the kids edition moves what follows each
  // line it replaces, so it always goes out whole.
  const range =
    onlyRange && interval && hasRange && !kids
      ? { from: Math.max(0, interval.start), to: Math.min(lesson, interval.end) }
      : undefined;
  const total = range ? range.to - range.from : lesson;
  const ratio = project.settings.width / project.settings.height;
  const even = (v: number): number => Math.round(v / 2) * 2;
  const frameOf = (side: number): [number, number] =>
    portrait ? [even(side), even(side / ratio)] : [even(side * ratio), even(side)];
  const [width, height] = frameOf(short);
  const sizeEstimate = (((isAudio ? 0 : bitrate) + 192) * 1000 * total) / 8;
  // Recordings whose cursor data went missing export only after "Exportar sem o cursor".
  const [withoutCursor, setWithoutCursor] = useState(false);
  const noCursor = project.assets.filter(
    (a) => !a.missing && a.cursorMissing && project.clips.some((c) => c.assetId === a.id),
  );
  // Same list the export refuses (state/exportQueue.ts): missing files and missing cursor data
  // not let go of.
  const missing = project.assets.filter(
    (a) =>
      (a.missing || (a.cursorMissing && !withoutCursor)) &&
      project.clips.some((c) => c.assetId === a.id),
  );
  const toFind = missing.filter(needsRelink).length;

  useEffect(() => playback.pause(), []);

  // The check before exporting, made again whenever the lesson or a choice here changes. A
  // volume measured on another revision of the lesson no longer counts.
  const [check, setCheck] = useState<LessonCheck | null>(null);
  const [loudness, setLoudness] = useState<MeasuredLoudness | null>(null);
  const measured = loudness && loudness.revision === revision ? loudness : null;
  const [measuring, setMeasuring] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    checkLesson(project, revision, { normalize, srt: captions, loudness: measured }).then(
      (list) => {
        if (!alive) return;
        setCheck(list);
        setCheckError(null);
      },
      (err: unknown) => {
        if (alive) setCheckError(cleanError(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [project, revision, normalize, captions, measured]);
  const measure = async (): Promise<void> => {
    setMeasuring(true);
    try {
      setLoudness(await measureLoudness());
    } catch (err) {
      setCheckError(`O volume não pôde ser medido: ${cleanError(err)}`);
    } finally {
      setMeasuring(false);
    }
  };

  const choose = (p: Preset): void => {
    if (p.soon) return;
    setPreset(p.id);
    setShort(Math.min(p.height, projectShort));
    if (p.bitrate) setBitrate(p.bitrate);
  };

  const start = async (): Promise<void> => {
    const safe = project.name.replace(/[<>:"/\\|?*]/g, "").trim() || "aula";
    const outPath = await window.api.pickExportPath(
      `${safe}${kids ? " (kids)" : ""}${range ? " (trecho)" : ""}${relayout ? " (vertical)" : ""}.${isAudio ? "mp3" : "mp4"}`,
    );
    if (!outPath) return;
    // The voice and the music go to a folder of their own (picked here).
    const picked = stems
      ? await window.api.pickStems(outPath.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, ""))
      : null;
    if (stems && !picked) return;
    const common = {
      outPath,
      fps: project.settings.fps,
      normalizeLoudness: normalize,
      encoder: info?.encoder ?? "x264",
      ...(range ? { range } : {}),
      ...(picked ? { stems: picked } : {}),
    };
    const spec: ExportSpec = isAudio
      ? { ...common, width, height, videoBitrate: 0, audioOnly: true }
      : relayout
        ? {
            ...common,
            width: 1080,
            height: 1920,
            videoBitrate: bitrate,
            quality: qualityOf(bitrate),
            thumbnail,
            vertical,
          }
        : {
            ...common,
            width,
            height,
            videoBitrate: bitrate,
            quality: qualityOf(bitrate),
            thumbnail,
          };
    const base = withoutCursor ? withoutMissingCursors(project) : project;
    // The kids edition is the same lesson with the characters' lines in place, made now.
    const built = kids ? await kidsProject(base) : null;
    if (built?.skipped.length)
      useApp
        .getState()
        .toast(
          `Na versão kids, ficaram de fora (a fala não está mais na aula ou o vídeo saiu): ${built.skipped.join(", ")}.`,
          "info",
        );
    exportQueue.add({
      id: newId("export"),
      project: built?.project ?? base,
      spec,
      captions,
      extras: {
        translations: translations && ready.current.length > 0,
        platform: platform && !isAudio,
      },
    });
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
            {hasKids && (
              <>
                <span className="section-label">VERSÃO</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={edition === "adult" ? "is-active" : ""}
                    onClick={() => setEdition("adult")}
                  >
                    <strong>Adulto</strong>
                    <span>a aula como está</span>
                  </button>
                  <button
                    type="button"
                    className={edition === "kids" ? "is-active" : ""}
                    onClick={() => setEdition("kids")}
                  >
                    <strong>Kids</strong>
                    <span>com as falas dos personagens</span>
                  </button>
                </div>
              </>
            )}
            {relayout && (
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
            {!isAudio && !relayout && (
              <div className="grid-2">
                <Field label="Resolução" htmlFor="export-resolution">
                  <select
                    id="export-resolution"
                    className="select"
                    value={short}
                    onChange={(e) => setShort(Number(e.target.value))}
                  >
                    {[2160, 1440, 1080, 720]
                      .filter((side) => side <= projectShort)
                      .map((side) => {
                        const [w, h] = frameOf(side);
                        return (
                          <option key={side} value={side}>
                            {w} × {h}
                          </option>
                        );
                      })}
                  </select>
                </Field>
                <Field label="Codificador">
                  <div className="static-field">
                    H.264 ·{" "}
                    {info && isHardwareEncoder(info.encoder) ? (
                      <span className="accent">GPU {encoderName(info.encoder)}</span>
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
                      <span className="mono">até {kbps / 1000} Mbps</span>
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
            <div className="loudness">
              <Scissors size={15} className="accent" />
              <div className="spacer">
                <strong>Só o intervalo marcado</strong>
                <p className="muted">
                  {hasRange && interval
                    ? `De ${duration(interval.start)} a ${duration(interval.end)}: as legendas e os capítulos começam no início do trecho.`
                    : "Marque um intervalo na régua da timeline para exportar só ele."}
                </p>
              </div>
              <Toggle
                on={onlyRange && hasRange && !kids}
                onChange={(v) => setOnlyRange(v && hasRange && !kids)}
                label="Só o intervalo marcado"
              />
            </div>
            <div className="loudness">
              <AudioLines size={15} className="accent" />
              <div className="spacer">
                <strong>Voz e música separadas (WAV)</strong>
                <p className="muted">
                  Dois arquivos numa pasta que você escolhe, para mixar em outro programa.
                </p>
              </div>
              <Toggle on={stems} onChange={setStems} label="Voz e música separadas" />
            </div>
            {!isAudio && (
              <div className="loudness">
                <Image size={15} className="accent" />
                <div className="spacer">
                  <strong>Miniatura (.jpg)</strong>
                  <p className="muted">
                    {project.publish?.thumbnail
                      ? `O quadro escolhido (${duration(project.publish.thumbnail.time)}), em 1280 px, ao lado do vídeo.`
                      : "Um quadro de 1280 px salvo ao lado do vídeo, para a capa da aula."}
                  </p>
                </div>
                <Toggle on={thumbnail} onChange={setThumbnail} label="Gerar miniatura" />
              </div>
            )}
            {(ready.current.length > 0 || ready.stale.length > 0) && (
              <div className="loudness">
                <Languages size={15} className="accent" />
                <div className="spacer">
                  <strong>Legendas traduzidas</strong>
                  <p className="muted">
                    {ready.current.length
                      ? `Em ${ready.current.join(", ")}, como aula.${ready.current[0]}.srt e .vtt.`
                      : "Nenhuma em dia."}
                    {ready.stale.length
                      ? ` ${ready.stale.join(", ")} ${ready.stale.length === 1 ? "ficou" : "ficaram"} de fora: a aula mudou depois da tradução.`
                      : ""}
                  </p>
                </div>
                <Toggle
                  on={translations && ready.current.length > 0}
                  onChange={setTranslations}
                  label="Exportar legendas traduzidas"
                />
              </div>
            )}
            {!isAudio && (
              <div className="loudness">
                <FileJson size={15} className="accent" />
                <div className="spacer">
                  <strong>Pacote para a plataforma</strong>
                  <p className="muted">
                    aula.plataforma.json com o código do vídeo, título, descrição, capítulos
                    válidos, quiz, miniatura e legendas, para a subida manual na sua plataforma de
                    cursos.
                  </p>
                </div>
                <Toggle on={platform} onChange={setPlatform} label="Gerar pacote da plataforma" />
              </div>
            )}
            <div className="export-check">
              <div className="export-check-head">
                <Gauge size={15} className="accent" />
                <strong className="spacer">Verificação antes de exportar</strong>
                <Button
                  size="sm"
                  disabled={measuring}
                  onClick={() => void measure()}
                  title="Mede o volume e o pico do som da aula como a exportação vai mixar"
                >
                  {measuring ? "Medindo o volume…" : measured ? "Medir de novo" : "Medir o volume"}
                </Button>
              </div>
              {draftWaiting && (
                <p className="muted">
                  Há um rascunho esperando revisão na barra acima da timeline: ele só entra na
                  exportação depois de aplicado.
                </p>
              )}
              {checkError ? (
                <p className="muted">{checkError}</p>
              ) : check ? (
                <PreflightList
                  check={check}
                  normalize={() => setNormalize(true)}
                  withoutCursor={() => setWithoutCursor(true)}
                />
              ) : (
                <p className="muted">Conferindo a aula…</p>
              )}
            </div>
            {withoutCursor && noCursor.length > 0 && (
              <div className="export-warning">
                <p>
                  Exportando sem o cursor de {noCursor.map((a) => a.name).join(", ")}: o ponteiro
                  não vai aparecer nesses trechos.
                </p>
                <Button size="sm" onClick={() => setWithoutCursor(false)}>
                  Manter o cursor
                </Button>
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
              <HardDrive size={14} /> {isAudio ? "≈" : "até"} {bytes(sizeEstimate)}
            </span>
            <span className="stat">
              <Timer size={14} /> {duration(total)} de vídeo
            </span>
            <span className="spacer" />
            {!isAudio && (
              <Button
                variant="ghost"
                icon={Camera}
                disabled={submitting || lesson <= 0}
                title="Salva o quadro que está no cursor de reprodução, do tamanho da aula"
                onClick={() => void exportCurrentFrame()}
              >
                Quadro atual (PNG)
              </Button>
            )}
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={Upload}
              onClick={() => void enqueue()}
              disabled={submitting || total <= 0 || missing.length > 0}
            >
              {submitting ? "Adicionando…" : "Adicionar à fila"}
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
