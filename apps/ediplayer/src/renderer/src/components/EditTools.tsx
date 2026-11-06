import { canCopy, GIF_LONG } from "@shared/edit";
import { joinBlocker } from "@shared/media/compat";
import {
  clock,
  evenSplitPoints,
  isPartRemoved,
  normalizeRanges,
  piecesFromPoints,
  totalDuration,
} from "@shared/ranges";
import {
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Gauge,
  ImagePlay,
  ListPlus,
  Music,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Scissors,
  SquareSplitHorizontal,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { useState } from "react";
import { fileName, seek } from "../lib/media";
import {
  beginTransformChange,
  changeTransformLive,
  edit,
  fail,
  openSave,
  setPartGone,
  setTransform,
  splitHere,
  type ToolId,
  toast,
  useStore,
} from "../state/store";

const TOOLS: { id: ToolId; name: string; icon: React.ReactNode }[] = [
  { id: "trim", name: "Aparar e cortar", icon: <Scissors size={16} /> },
  { id: "split", name: "Dividir", icon: <SquareSplitHorizontal size={16} /> },
  { id: "join", name: "Juntar arquivos", icon: <ListPlus size={16} /> },
  { id: "rotate", name: "Girar e espelhar", icon: <RotateCw size={16} /> },
  { id: "crop", name: "Recortar quadro", icon: <Crop size={16} /> },
  { id: "speed", name: "Velocidade", icon: <Gauge size={16} /> },
  { id: "audio", name: "Volume e áudio", icon: <Music size={16} /> },
  { id: "subtitle", name: "Legenda gravada", icon: <Type size={16} /> },
  { id: "convert", name: "Converter", icon: <RefreshCcw size={16} /> },
  { id: "gif", name: "GIF do trecho", icon: <ImagePlay size={16} /> },
];

function Toggle({
  on,
  onChange,
  title,
  detail,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  title: string;
  detail?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="toggle"
      onClick={() => onChange(!on)}
    >
      <span className="sw" />
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </button>
  );
}

export function EditTools() {
  const tool = useStore((s) => s.tool);
  const facts = useStore((s) => s.facts);
  const t = useStore((s) => s.transform);
  const precise = useStore((s) => s.precise);
  const hasVideo = facts?.hasVideo ?? false;
  return (
    <aside className="tools">
      <h2>Edições</h2>
      <div className="tool-grid">
        {TOOLS.map((x) => (
          <button
            type="button"
            key={x.id}
            className={`tool${tool === x.id ? " on" : ""}`}
            disabled={!hasVideo && ["rotate", "crop", "subtitle", "gif"].includes(x.id)}
            onClick={() => useStore.setState({ tool: x.id })}
          >
            {x.icon}
            {x.name}
          </button>
        ))}
      </div>
      <div className="tool-body">
        {tool === "trim" && <TrimTool />}
        {tool === "split" && <SplitTool />}
        {tool === "join" && <JoinTool />}
        {tool === "rotate" && <RotateTool />}
        {tool === "crop" && <CropTool />}
        {tool === "speed" && <SpeedTool />}
        {tool === "audio" && <AudioTool />}
        {tool === "subtitle" && <SubtitleTool />}
        {tool === "convert" && <ConvertTool />}
        {tool === "gif" && <GifTool />}
        <span className={canCopy(t, "original", precise, facts ?? undefined) ? "info" : "warn"}>
          {canCopy(t, "original", precise, facts ?? undefined)
            ? hasVideo
              ? "Sem recodificar a imagem: salva em segundos, sem perder qualidade."
              : "Sem recodificar: salva em segundos."
            : "Com estas edições o resultado é recodificado em alta qualidade: leva mais tempo."}
        </span>
      </div>
    </aside>
  );
}

function TrimTool() {
  const mode = useStore((s) => s.mode);
  const precise = useStore((s) => s.precise);
  return (
    <>
      <div className="segmented">
        <button
          type="button"
          aria-pressed={mode === "remove"}
          className={mode === "remove" ? "on" : ""}
          onClick={() => useStore.setState({ mode: "remove" })}
        >
          Remover marcados
        </button>
        <button
          type="button"
          aria-pressed={mode === "keep"}
          className={mode === "keep" ? "on" : ""}
          onClick={() => useStore.setState({ mode: "keep" })}
        >
          Manter só eles
        </button>
      </div>
      <Toggle
        on={precise}
        onChange={(v) => useStore.setState({ precise: v })}
        title="Corte preciso"
        detail="Desligado: sem recodificar a imagem, cada trecho começa no quadro-chave anterior à marca. Ligado: corta no quadro exato e recodifica o resultado."
      />
    </>
  );
}

function SplitTool() {
  const points = useStore((s) => s.splitPoints);
  const duration = useStore((s) => s.duration);
  const marks = useStore((s) => s.marks);
  const mode = useStore((s) => s.mode);
  const time = useStore((s) => s.time);
  const clicked = useStore((s) => s.part);
  const [minutes, setMinutes] = useState(10);
  const parts = piecesFromPoints(points, duration);
  const gone = parts.map((p) => isPartRemoved(p, marks, mode, duration));
  const left = gone.filter((g) => !g).length;
  return (
    <>
      <div className="row">
        <button type="button" className="btn" onClick={splitHere}>
          Dividir no ponto atual <kbd>S</kbd>
        </button>
      </div>
      <label className="field">
        A cada quantos minutos
        <span className="row">
          <input
            type="number"
            min={1}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
          />
          <button
            type="button"
            className="btn"
            onClick={() => edit({ splitPoints: evenSplitPoints(duration, minutes * 60) })}
          >
            Aplicar
          </button>
        </span>
      </label>
      {parts.length > 1 ? (
        <div className="marks">
          <span className="label">Partes</span>
          {parts.map((p, i) => {
            const here = clicked === null ? time >= p.start && time < p.end : clicked === i;
            return (
              <div key={p.start} className={`mark-row${here ? " sel" : ""}`}>
                <button
                  type="button"
                  className="mark-row"
                  style={{ padding: 0, height: "auto" }}
                  onClick={() => {
                    seek(p.start);
                    useStore.setState({ part: i, selected: null });
                  }}
                >
                  <span className="n">{i + 1}</span>
                  <span className="mono">
                    {clock(p.start)} → {clock(p.end)}
                  </span>
                  {gone[i] && <span className="tag-out">apagada</span>}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  aria-label={gone[i] ? `Voltar a parte ${i + 1}` : `Apagar a parte ${i + 1}`}
                  title={gone[i] ? "Voltar a parte" : "Apagar a parte (Delete)"}
                  onClick={() => setPartGone(i, !gone[i])}
                >
                  {gone[i] ? <Undo2 size={14} /> : <Trash2 size={14} />}
                </button>
              </div>
            );
          })}
          <div className="row cuts">
            {points.map((p, i) => (
              <button
                key={p}
                type="button"
                className="cut-chip"
                aria-label={`Tirar o corte em ${clock(p)}`}
                onClick={() => edit({ splitPoints: points.filter((x) => x !== p) })}
              >
                Corte {i + 1} · {clock(p)} <X size={12} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <span className="info">
          Aperte S nos pontos onde quer dividir. Depois clique numa parte na régua e apague com
          Delete.
        </span>
      )}
      <button
        type="button"
        className="btn primary"
        disabled={!gone.some(Boolean)}
        onClick={() => openSave("export")}
      >
        Salvar o vídeo sem as partes apagadas…
      </button>
      <button type="button" className="btn" disabled={left < 2} onClick={() => openSave("split")}>
        Salvar cada parte num arquivo ({left})…
      </button>
    </>
  );
}

function JoinTool() {
  const files = useStore((s) => s.joinFiles);
  const facts = useStore((s) => s.facts);
  const all = facts ? [facts, ...files.filter((f) => f.path !== facts.path)] : files;
  const blocker = all.length > 1 ? joinBlocker(all) : null;
  const add = async () => {
    const paths = await window.api.pickJoinFiles();
    const probed = await Promise.all(paths.map((p) => window.api.probe(p)));
    const known = new Set(useStore.getState().joinFiles.map((f) => f.path));
    useStore.setState({
      joinFiles: [...useStore.getState().joinFiles, ...probed.filter((p) => !known.has(p.path))],
    });
  };
  return (
    <>
      <span className="info">O vídeo aberto vem primeiro; os outros entram na ordem abaixo.</span>
      <div className="list-mini">
        {all.map((f, i) => (
          <div key={f.path} className="li">
            <span>
              {i + 1}. {f.name}
            </span>
            <span className="mono quiet">{clock(f.duration)}</span>
            {i > 0 && (
              <button
                type="button"
                className="icon-btn"
                style={{ width: 24, height: 24 }}
                aria-label={`Tirar ${f.name}`}
                onClick={() =>
                  useStore.setState({ joinFiles: files.filter((x) => x.path !== f.path) })
                }
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="btn" onClick={() => void add().catch(fail)}>
        Escolher vídeos para juntar…
      </button>
      {all.length > 1 && (
        <span className={blocker ? "warn" : "info"}>
          {blocker
            ? `Precisa converter: ${blocker}`
            : `Mesmo formato: junta sem recodificar (${clock(totalDuration(all.map((f) => ({ start: 0, end: f.duration }))))}).`}
        </span>
      )}
      <button
        type="button"
        className="btn primary"
        disabled={all.length < 2}
        onClick={() => openSave("join", blocker ? "youtube" : "original")}
      >
        Juntar {all.length > 1 ? all.length : ""} arquivos…
      </button>
    </>
  );
}

function RotateTool() {
  const t = useStore((s) => s.transform);
  const turn = (by: number) =>
    setTransform({ rotate: ((((t.rotate + by) % 360) + 360) % 360) as 0 | 90 | 180 | 270 });
  return (
    <>
      <div className="row">
        <button type="button" className="btn" onClick={() => turn(-90)}>
          <RotateCcw size={15} /> 90° à esquerda
        </button>
        <button type="button" className="btn" onClick={() => turn(90)}>
          <RotateCw size={15} /> 90° à direita
        </button>
      </div>
      <div className="row">
        <button
          type="button"
          className={`btn${t.flipH ? " primary" : ""}`}
          aria-pressed={t.flipH}
          onClick={() => setTransform({ flipH: !t.flipH })}
        >
          <FlipHorizontal2 size={15} /> Espelhar
        </button>
        <button
          type="button"
          className={`btn${t.flipV ? " primary" : ""}`}
          aria-pressed={t.flipV}
          onClick={() => setTransform({ flipV: !t.flipV })}
        >
          <FlipVertical2 size={15} /> De ponta-cabeça
        </button>
      </div>
      <span className="info">
        Girado {t.rotate}°. Só girar não recodifica: o vídeo guarda a direção certa.
      </span>
    </>
  );
}

const ASPECTS: { name: string; ratio: number | null }[] = [
  { name: "Livre", ratio: null },
  { name: "16:9", ratio: 16 / 9 },
  { name: "9:16", ratio: 9 / 16 },
  { name: "1:1", ratio: 1 },
  { name: "4:3", ratio: 4 / 3 },
];

function CropTool() {
  const t = useStore((s) => s.transform);
  const facts = useStore((s) => s.facts);
  const aspect = (facts?.width ?? 16) / Math.max(1, facts?.height ?? 9);
  const fit = (ratio: number | null) => {
    if (ratio === null) return setTransform({ crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
    // The biggest centered box of that shape (in pixels) inside the picture.
    const w = ratio >= aspect ? 1 : ratio / aspect;
    const h = ratio >= aspect ? aspect / ratio : 1;
    setTransform({ crop: { x: (1 - w) / 2, y: (1 - h) / 2, w, h } });
  };
  return (
    <>
      <div className="row">
        {ASPECTS.map((a) => (
          <button type="button" key={a.name} className="btn" onClick={() => fit(a.ratio)}>
            {a.name}
          </button>
        ))}
      </div>
      <span className="info">Arraste o retângulo sobre o vídeo; o canto muda o tamanho.</span>
      {t.crop && (
        <button type="button" className="btn ghost" onClick={() => setTransform({ crop: null })}>
          Tirar o recorte
        </button>
      )}
    </>
  );
}

function SpeedTool() {
  const t = useStore((s) => s.transform);
  return (
    <label className="field">
      Velocidade do resultado:{" "}
      <strong className="mono">{t.speed.toFixed(2).replace(".", ",")}×</strong>
      <input
        type="range"
        min={0.5}
        max={4}
        step={0.25}
        value={t.speed}
        onPointerDown={beginTransformChange}
        onKeyDown={beginTransformChange}
        onChange={(e) => changeTransformLive({ speed: Number(e.target.value) })}
      />
      <span className="info">
        O som acompanha sem ficar fino ou grosso. Para só assistir mais rápido, use a velocidade do
        player.
      </span>
    </label>
  );
}

function AudioTool() {
  const t = useStore((s) => s.transform);
  const facts = useStore((s) => s.facts);
  if (!facts) return null;
  return (
    <>
      <label className="field">
        Volume: <strong className="mono">{Math.round(t.gain * 100)}%</strong>
        <input
          type="range"
          min={0}
          max={3}
          step={0.05}
          value={t.gain}
          disabled={t.removeAudio}
          onPointerDown={beginTransformChange}
          onKeyDown={beginTransformChange}
          onChange={(e) => changeTransformLive({ gain: Number(e.target.value) })}
        />
      </label>
      <Toggle
        on={t.normalize}
        onChange={(v) => setTransform({ normalize: v })}
        title="Normalizar o volume"
        detail="Deixa a fala num volume confortável e constante."
      />
      <Toggle
        on={t.removeAudio}
        onChange={(v) => setTransform({ removeAudio: v, replaceAudio: v ? null : t.replaceAudio })}
        title="Tirar o som"
      />
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() =>
            void window.api
              .pickAudio()
              .then((p) => p && setTransform({ replaceAudio: p, removeAudio: false }))
              .catch(fail)
          }
        >
          {t.replaceAudio ? "Trocar o novo som…" : "Trocar o som por outro arquivo…"}
        </button>
        {t.replaceAudio && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => setTransform({ replaceAudio: null })}
          >
            Manter o som original
          </button>
        )}
      </div>
      {t.replaceAudio && <span className="info">Novo som: {fileName(t.replaceAudio)}</span>}
      <button
        type="button"
        className="btn"
        disabled={!facts.audio.length}
        onClick={() => openSave("audio")}
      >
        Extrair o som…
      </button>
    </>
  );
}

function SubtitleTool() {
  const t = useStore((s) => s.transform);
  const subtitle = useStore((s) => s.subtitle);
  const delay = useStore((s) => s.subtitleDelay);
  return (
    <>
      <span className="info">
        Grava a legenda na imagem: aparece em qualquer lugar, mas não dá mais para desligar.
      </span>
      {subtitle?.path && !t.burnSubtitles && (
        <button
          type="button"
          className="btn"
          onClick={() => setTransform({ burnSubtitles: subtitle.path, subtitleDelay: delay })}
        >
          Gravar {subtitle.name}
        </button>
      )}
      <button
        type="button"
        className="btn"
        onClick={() =>
          void window.api
            .pickSubtitle()
            .then((p) => p && setTransform({ burnSubtitles: p, subtitleDelay: 0 }))
            .catch(fail)
        }
      >
        Escolher um .srt ou .vtt…
      </button>
      {t.burnSubtitles && (
        <>
          <span className="info">
            Vai gravar: {fileName(t.burnSubtitles)}
            {t.subtitleDelay ? ` (atraso ${t.subtitleDelay.toFixed(1).replace(".", ",")} s)` : ""}
          </span>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setTransform({ burnSubtitles: null })}
          >
            Não gravar legenda
          </button>
        </>
      )}
    </>
  );
}

function ConvertTool() {
  return (
    <>
      <span className="info">
        Escolha um formato pronto para WhatsApp, e-mail, YouTube, só o áudio em MP3 ou GIF. Os
        cortes e edições marcados entram junto.
      </span>
      <button type="button" className="btn primary" onClick={() => openSave("export", "whatsapp")}>
        Escolher o formato…
      </button>
    </>
  );
}

function GifTool() {
  const marks = useStore((s) => s.marks);
  const duration = useStore((s) => s.duration);
  // A GIF is made of the marked stretches themselves, whatever the cut mode.
  const length = totalDuration(normalizeRanges(marks, duration));
  return (
    <>
      <span className="info">Marque o trecho com I e O. O GIF fica sem som e em loop.</span>
      <span className="mono">Duração do GIF: {clock(length)}</span>
      {length > GIF_LONG && (
        <span className="warn">
          GIF de {clock(length)} fica pesado. Marque um trecho curto (até 30 s).
        </span>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          if (!marks.length) toast("Marque o trecho do GIF com I e O.");
          else openSave("export", "gif", true);
        }}
      >
        Salvar GIF…
      </button>
    </>
  );
}
