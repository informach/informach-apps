import { clock } from "@shared/ranges";
import { GraduationCap, Plus, Upload, X } from "lucide-react";
import { useState } from "react";
import {
  confirmLeave,
  fail,
  loadSubtitleFile,
  loadSubtitleTrack,
  openPaths,
  playIndex,
  removeFromList,
  savePrefs,
  toast,
  useStore,
} from "../state/store";

const LANG: Record<string, string> = {
  por: "Português",
  eng: "Inglês",
  spa: "Espanhol",
  fre: "Francês",
  fra: "Francês",
  ger: "Alemão",
  deu: "Alemão",
  ita: "Italiano",
  jpn: "Japonês",
};
// "und" is FFmpeg's "language not set".
const language = (code?: string) =>
  code && code !== "und" ? (LANG[code] ?? code.toUpperCase()) : undefined;

/** The play list and the facts of the current file ("Neste vídeo"). */
export function Sidebar() {
  const list = useStore((s) => s.list);
  const index = useStore((s) => s.index);
  const facts = useStore((s) => s.facts);
  const source = useStore((s) => s.source);
  const subtitle = useStore((s) => s.subtitle);
  const delay = useStore((s) => s.subtitleDelay);
  const prefs = useStore((s) => s.prefs);
  const [over, setOver] = useState(false);
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
    const subs = paths.filter((p) => /\.(srt|vtt)$/i.test(p));
    const media = paths.filter((p) => !/\.(srt|vtt)$/i.test(p));
    if (subs[0]) void loadSubtitleFile(subs[0]).catch(fail);
    if (media.length) void openPaths(media).catch(fail);
  };
  return (
    <aside
      className="side"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <div className="side-head">
        <strong>Lista</strong>
        <span className="quiet">
          {list.length} {list.length === 1 ? "arquivo" : "arquivos"}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="icon-btn"
          style={{ width: 32, height: 32 }}
          aria-label="Adicionar arquivos"
          onClick={() => void window.api.pickFiles().then(openPaths).catch(fail)}
        >
          <Plus size={16} />
        </button>
      </div>
      {list.map((item, i) => (
        <div key={item.path} className={`item${i === index ? " current" : ""}`}>
          <button
            type="button"
            className="item-main"
            title={item.name}
            onClick={() =>
              void (async () => {
                if (i !== index && !(await confirmLeave())) return;
                await playIndex(i);
              })().catch(fail)
            }
          >
            <span className="item-text">
              <span className="name">{item.name}</span>
              <small>
                {i === index ? "Tocando" : "Na lista"}
                {item.mode && item.mode !== "native" && (
                  <span className="badge">{item.mode === "preview" ? "prévia" : "cópia"}</span>
                )}
              </small>
            </span>
          </button>
          <button
            type="button"
            className="icon-btn x"
            aria-label={`Tirar ${item.name} da lista`}
            title="Tirar da lista (o arquivo não é apagado)"
            onClick={() => void removeFromList(item.path).catch(fail)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div className={`side-drop${over ? " over" : ""}`}>
        <Upload size={18} />
        Arraste vídeos ou uma legenda .srt / .vtt
      </div>
      <span className="spacer" />
      {facts && source && (
        <div className="facts">
          <span className="label">Neste vídeo</span>
          {facts.audio.length > 1 && (
            <div className="fact">
              <span>Áudio</span>
              <select
                value={source.audioIndex}
                onChange={(e) => void playIndex(index, Number(e.target.value)).catch(fail)}
              >
                {facts.audio.map((a) => (
                  <option key={a.index} value={a.index}>
                    {a.title ?? language(a.language) ?? `Faixa ${a.index + 1}`} ·{" "}
                    {a.codec.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )}
          {facts.audio.length === 1 && (
            <div className="fact">
              <span>Áudio</span>
              <span>
                {language(facts.audio[0]?.language) ?? "Faixa 1"} ·{" "}
                {facts.audio[0]?.codec.toUpperCase()}
              </span>
            </div>
          )}
          <div className="fact">
            <span>Legenda</span>
            <select
              value={
                subtitle
                  ? subtitle.path
                    ? "file"
                    : subtitle.track !== null
                      ? `track:${subtitle.track}`
                      : "none"
                  : "none"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "none") useStore.setState({ subtitle: null });
                else if (v === "pick")
                  void window.api
                    .pickSubtitle()
                    .then((p) => (p ? loadSubtitleFile(p) : undefined))
                    .catch(fail);
                else if (v.startsWith("track:"))
                  void loadSubtitleTrack(Number(v.slice(6))).catch(fail);
              }}
            >
              <option value="none">Nenhuma</option>
              {subtitle?.path && <option value="file">{subtitle.name}</option>}
              {facts.subtitles.map((s) => (
                <option key={s.index} value={`track:${s.index}`} disabled={!s.text}>
                  {s.title ?? language(s.language) ?? `Faixa ${s.index + 1}`}
                  {s.text ? "" : " (imagem)"}
                </option>
              ))}
              <option value="pick">Abrir .srt ou .vtt…</option>
            </select>
          </div>
          {subtitle && (
            <>
              <div className="fact">
                <span>Atraso da legenda</span>
                <span className="stepper">
                  <button
                    type="button"
                    aria-label="Legenda mais cedo"
                    onClick={() =>
                      useStore.setState({ subtitleDelay: Math.round((delay - 0.1) * 10) / 10 })
                    }
                  >
                    −
                  </button>
                  <span className="mono">{`${delay >= 0 ? "+" : ""}${delay.toFixed(1).replace(".", ",")} s`}</span>
                  <button
                    type="button"
                    aria-label="Legenda mais tarde"
                    onClick={() =>
                      useStore.setState({ subtitleDelay: Math.round((delay + 0.1) * 10) / 10 })
                    }
                  >
                    +
                  </button>
                </span>
              </div>
              <div className="fact">
                <span>Tamanho</span>
                <span className="stepper">
                  <button
                    type="button"
                    aria-label="Legenda menor"
                    onClick={() =>
                      void savePrefs({ subtitleSize: Math.max(0.5, prefs.subtitleSize - 0.1) })
                    }
                  >
                    −
                  </button>
                  <span className="mono">{Math.round(prefs.subtitleSize * 100)}%</span>
                  <button
                    type="button"
                    aria-label="Legenda maior"
                    onClick={() =>
                      void savePrefs({ subtitleSize: Math.min(3, prefs.subtitleSize + 0.1) })
                    }
                  >
                    +
                  </button>
                </span>
              </div>
            </>
          )}
          <div className="fact">
            <span>Formato</span>
            <span className="mono" style={{ fontSize: 11.5 }}>
              {facts.hasVideo
                ? `${(facts.videoCodec ?? "").toUpperCase()} · ${facts.width}×${facts.height}${facts.fps ? ` · ${Math.round(facts.fps)} qps` : ""}`
                : "Só áudio"}
            </span>
          </div>
          <div className="fact">
            <span>Duração</span>
            <span className="mono">{clock(facts.duration)}</span>
          </div>
          {source.mode !== "native" && (
            <span className="info">
              {source.mode === "preview"
                ? "Tocando uma prévia convertida. Os cortes usam o arquivo original."
                : "Tocando uma cópia dos mesmos dados, num formato que o player abre."}
            </span>
          )}
          <button
            type="button"
            className="btn"
            onClick={() =>
              void window.api
                .openInEdiAula(facts.path)
                .then((r) =>
                  toast(
                    r === "opened"
                      ? "EdiAula aberto. O caminho do vídeo foi copiado: importe-o lá."
                      : "O EdiAula não está instalado. Instale pelo Edi Hub.",
                  ),
                )
                .catch(fail)
            }
          >
            <GraduationCap size={15} />
            Abrir no EdiAula
          </button>
        </div>
      )}
    </aside>
  );
}
