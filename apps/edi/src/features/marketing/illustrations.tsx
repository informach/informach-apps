import { EDI_TOOL_BRAND } from "@informach/config/edi-brand";
import { ToolIcon, toolStyle } from "../../components/site/brand";

/*
 * Product illustrations for the sales page. They show real features with sample
 * data, are drawn in HTML/CSS (no screenshots to keep in sync) and are exposed to
 * assistive technology as a single described image.
 */

const WAVE =
  "M0 12L5 7L10 16L15 9L20 14L25 5L30 18L35 10L40 13L45 6L50 17L55 11L60 12L65 8L70 15L75 4L80 19L85 9L90 14L95 7L100 16L105 10L110 12L115 6L120 18L125 9L130 13L135 5L140 17L145 11L150 12L155 7L160 16L165 9L170 14L175 4L180 19L185 8L190 15L195 10L200 12L205 6L210 17L215 9L220 13L225 7L230 16L235 10L240 12L245 5L250 18L255 9L260 14L265 8L270 15L275 11L280 12L285 7L290 16L295 10L300 12";

function Waveform() {
  return (
    <div className="timeline__audio">
      <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path
          d={WAVE}
          fill="none"
          stroke={EDI_TOOL_BRAND.edicaptura.color}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

type Clip = { id: string; size: number; cut?: boolean };

function Clips({ parts }: { parts: readonly Clip[] }) {
  return (
    <div className="timeline__clips">
      {parts.map((part) => (
        <span
          key={part.id}
          className={part.cut ? "timeline__cut" : undefined}
          style={{ flex: part.size }}
        />
      ))}
    </div>
  );
}

export function LessonWindow() {
  return (
    <div
      className="hero__visual"
      role="img"
      aria-label="EdiAula com uma aula de frações: o vídeo, a transcrição com os vícios de fala riscados, a timeline com zooms nos cliques e o resumo da limpeza automática."
    >
      <div className="mock lesson-window">
        <div className="mock__bar">
          <ToolIcon tool="ediaula" size="xs" />
          <span>frações-equivalentes.ediaula</span>
          <span className="mock__status">salvo agora</span>
        </div>
        <div className="lesson-window__body">
          <div className="lesson-window__preview">
            <div className="whiteboard">
              <div className="equation">
                <span className="fraction">
                  <span>1</span>
                  <span className="fraction__bar" />
                  <span>2</span>
                </span>
                <span>=</span>
                <span className="fraction">
                  <span>2</span>
                  <span className="fraction__bar" />
                  <span>4</span>
                </span>
              </div>
              <span className="whiteboard__halo" />
              <svg
                className="whiteboard__cursor"
                width="16"
                height="20"
                viewBox="0 0 16 20"
                aria-hidden="true"
              >
                <path
                  d="M1 1v15l4-4 3 7 3-1-3-7h6z"
                  fill="#F4F1EA"
                  stroke="#1B1F24"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="whiteboard__camera">
                <svg width="48" height="48" viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="16" r="7" fill="#1B1F24" />
                  <path d="M6 40c1-9 7-14 14-14s13 5 14 14z" fill="#1B1F24" />
                </svg>
              </span>
              <span className="whiteboard__tag">zoom no clique</span>
            </div>
          </div>
          <div className="lesson-window__transcript">
            <span className="mock__label">TRANSCRIÇÃO</span>
            <p className="transcript">
              Então, <s>né,</s> hoje a gente vai ver{" "}
              <span className="transcript__protected">frações equivalentes</span>. <s>Tipo,</s> se
              eu corto uma pizza em duas partes <s className="transcript__pause">pausa 2,4 s</s> e
              corto cada metade de novo, <s>ahn,</s> quantas fatias eu tenho?
            </p>
            <span className="legend">
              <span>
                <i
                  className="legend__swatch"
                  style={{ background: EDI_TOOL_BRAND.ediaula.color }}
                />
                Trecho protegido
              </span>
            </span>
          </div>
        </div>
        <div className="timeline">
          <div className="timeline__zooms">
            <span style={{ left: "14%", width: "11%" }} />
            <span style={{ left: "52%", width: "14%" }} />
          </div>
          <Clips
            parts={[
              { id: "abertura", size: 18 },
              { id: "corte-1", size: 2, cut: true },
              { id: "explicacao", size: 26 },
              { id: "corte-2", size: 3, cut: true },
              { id: "exemplo", size: 30 },
              { id: "fechamento", size: 21 },
            ]}
          />
          <Waveform />
          <span className="timeline__head" />
        </div>
      </div>
      <div className="cleanup-card">
        <span className="mock__label">LIMPEZA AUTOMÁTICA</span>
        <div>
          <span>Vícios de fala</span>
          <strong>23</strong>
        </div>
        <div>
          <span>Silêncios longos</span>
          <strong>9</strong>
        </div>
        <div className="cleanup-card__total">
          <span>Tempo economizado</span>
          <strong>1 min 42 s</strong>
        </div>
        <span className="mock-chip mock-chip--tool" style={toolStyle("ediaula")}>
          Aplicar limpeza
        </span>
      </div>
    </div>
  );
}

export function TranscriptMock() {
  return (
    <div
      className="mock"
      role="img"
      aria-label="Painel de transcrição do EdiAula com a contagem de vícios de fala, frases riscadas para corte e a timeline com propostas de corte e zooms."
    >
      <div className="mock__tabs">
        <span className="is-active">Transcrição</span>
        <span>Roteiro</span>
        <span>Assistente</span>
      </div>
      <div className="mock__content">
        <div className="pill-row">
          <span>“né” × 14</span>
          <span>“tipo” × 9</span>
          <span>silêncios × 9</span>
          <span>frase repetida × 2</span>
        </div>
        <p className="transcript transcript--large">
          Agora repara: se eu pego <s>né, se eu pego</s> as duas metades e corto de novo, cada
          pedaço vira um quarto. <s>Tipo assim.</s> Duas fatias de quatro é a mesma coisa que uma de
          duas.
        </p>
        <div className="mock__footer">
          <span>
            Tempo economizado <strong>1 min 42 s</strong>
          </span>
          <span className="actions">
            <span className="mock-chip mock-chip--ghost">Revisar</span>
            <span className="mock-chip mock-chip--tool" style={toolStyle("ediaula")}>
              Aplicar limpeza
            </span>
          </span>
        </div>
        <div className="timeline timeline--panel">
          <div className="timeline__ticks">
            <span>00:00</span>
            <span>02:30</span>
            <span>05:00</span>
            <span>07:30</span>
          </div>
          <div className="timeline__zooms">
            <span style={{ left: "20%", width: "12%" }} />
            <span style={{ left: "61%", width: "9%" }} />
          </div>
          <Clips
            parts={[
              { id: "abertura", size: 22 },
              { id: "corte-1", size: 3, cut: true },
              { id: "explicacao", size: 35 },
              { id: "corte-2", size: 2, cut: true },
              { id: "exemplo", size: 38 },
            ]}
          />
          <Waveform />
          <span className="legend">
            <span>
              <i className="legend__swatch" style={{ background: "#F0B43C" }} />
              zoom nos cliques
            </span>
            <span>
              <i className="legend__swatch legend__swatch--cut" />
              proposta de corte
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function AnnotationGlyph({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function CaptureMock() {
  return (
    <div
      className="mock capture-mock"
      role="img"
      aria-label="EdiCaptura com um formulário capturado: passos numerados, uma seta para o botão Enviar, o e-mail pixelizado e a barra de anotações."
    >
      <div className="capture-page">
        <span className="capture-page__title" />
        <span className="capture-field">
          Nome completo
          <i />
        </span>
        <span className="capture-field">
          E-mail
          <i className="pixelated" />
        </span>
        <span className="capture-send">Enviar</span>
        <span className="step-badge" style={{ top: 78 }}>
          1
        </span>
        <span className="step-badge" style={{ top: 151 }}>
          2
        </span>
        <span className="step-badge" style={{ top: 200 }}>
          3
        </span>
        <svg
          className="capture-arrow"
          width="150"
          height="50"
          viewBox="0 0 150 50"
          aria-hidden="true"
        >
          <path
            d="M146 8C110 6 60 14 14 38"
            fill="none"
            stroke="#E2553E"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M12 26 12 40 26 42"
            fill="none"
            stroke="#E2553E"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="capture-callout">Clique em Enviar</span>
        <span className="capture-frame" />
        <span className="capture-size">1280 × 720</span>
      </div>
      <div className="capture-toolbar">
        <span className="is-active">
          <AnnotationGlyph d="M5 19 19 5M9 5h10v10" />
        </span>
        <span>
          <AnnotationGlyph d="M5 6h14M12 6v13" />
        </span>
        <span>
          <AnnotationGlyph d="M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
        </span>
        <span>
          <AnnotationGlyph d="m14 4 6 6-8 8H6v-6zM4 21h9" />
        </span>
        <span>
          <AnnotationGlyph d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM11 9l2-1v8" />
        </span>
        <span className="mock-chip">Copiar</span>
      </div>
    </div>
  );
}

export function PhotoMock() {
  return (
    <div
      className="mock photo-mock"
      role="img"
      aria-label="EdiFoto com a capa de um curso e o painel de camadas: a camada selecionada usa o modo Multiplicar, entre outros modos de mesclagem."
    >
      <div className="photo-canvas">
        <i
          className="photo-canvas__shape"
          style={{ right: "18%", top: "14%", width: 74, height: 74, background: "#F0B43C" }}
        />
        <i
          className="photo-canvas__shape"
          style={{
            left: "-20%",
            right: "30%",
            bottom: "-40%",
            height: "70%",
            background: "#5ED3B3",
          }}
        />
        <i
          className="photo-canvas__shape"
          style={{
            left: "30%",
            right: "-30%",
            bottom: "-46%",
            height: "70%",
            background: "#3FA88A",
            mixBlendMode: "multiply",
          }}
        />
        <span className="photo-canvas__title">Frações</span>
      </div>
      <div className="layers">
        <span className="mock__label">CAMADAS</span>
        <span className="layer">
          <i
            className="layer__thumb"
            style={{ background: "#1B1F24", border: "1px solid #3A424B" }}
          />
          <span className="layer__name">Título</span>
          <span className="layer__mode">Normal</span>
        </span>
        <span className="layer layer--selected">
          <i className="layer__thumb" style={{ background: "#3FA88A" }} />
          <span className="layer__name">Morro da frente</span>
          <span className="layer__mode">Multiplicar</span>
        </span>
        <span className="layer">
          <i
            className="layer__thumb"
            style={{
              background: "repeating-linear-gradient(90deg, #585C64 0 50%, #A9AFB7 50% 100%)",
            }}
          />
          <span className="layer__name">Ajuste de temperatura</span>
          <span className="layer__mode">Luz suave</span>
        </span>
        <span className="layer">
          <i className="layer__thumb" style={{ background: "#8CB6FF" }} />
          <span className="layer__name">Céu</span>
          <span className="layer__mode">Normal</span>
        </span>
        <span className="blend-modes">
          <span>Escurecer</span>
          <span className="is-active">Multiplicar</span>
          <span>Tela</span>
          <span>Sobrepor</span>
          <span>+ 23 modos</span>
        </span>
      </div>
    </div>
  );
}

/**
 * A page thumbnail described as "name:value" rows: a percentage draws a text line,
 * a colour draws a block standing for an image.
 */
function Page({ lines }: { lines: string }) {
  return (
    <i className="pdf-page__sheet">
      {lines.split(" ").map((row) => {
        const [name, value = ""] = row.split(":");
        return value.startsWith("#") ? (
          <b
            key={name}
            className="pdf-page__line"
            style={{ height: 20, width: "100%", background: value }}
          />
        ) : (
          <b key={name} className="pdf-page__line" style={{ width: `${value}%` }} />
        );
      })}
    </i>
  );
}

export function PdfMock() {
  return (
    <div
      className="mock pdf-mock"
      role="img"
      aria-label="EdiPDF organizando uma apostila: seis páginas em miniatura, uma delas sendo arrastada para nova posição, e as ações Juntar, Dividir, Assinar e Compactar."
    >
      <div className="pdf-pages">
        <span className="pdf-page">
          <Page lines="titulo:70 a:100 b:100 c:80" />1
        </span>
        <span className="pdf-page">
          <Page lines="titulo:60 imagem:#8CB6FF a:100 b:60" />2
        </span>
        <span className="pdf-page pdf-page--slot">
          <i className="pdf-page__sheet" />3
        </span>
        <span className="pdf-page">
          <Page lines="a:100 b:100 c:50 assinatura:30" />4
        </span>
        <span className="pdf-page">
          <Page lines="titulo:50 a:100 grifo:#C8E64A" />5
        </span>
        <span className="pdf-page">
          <Page lines="titulo:40 a:100 b:70" />6
        </span>
        <span className="pdf-page pdf-page--dragged">
          <Page lines="titulo:60 imagem:#FF8F7E a:100" />
        </span>
      </div>
      <div className="pdf-actions">
        <span className="is-active">Juntar PDFs</span>
        <span>Dividir</span>
        <span>Assinar</span>
        <span>Compactar</span>
        <small>Equilibrada · 150 dpi</small>
      </div>
    </div>
  );
}

export function VectorMock() {
  return (
    <div
      className="mock"
      role="img"
      aria-label="EdiSVG com um mascote selecionado no estado Acenando e a timeline da animação Acenar com quatro marcadores."
    >
      <div className="vector-stage">
        <div className="mascot">
          <i className="mascot__body" />
          <i className="mascot__eye" style={{ left: 38 }} />
          <i className="mascot__eye" style={{ left: 86 }} />
          <i className="mascot__pupil" style={{ left: 48 }} />
          <i className="mascot__pupil" style={{ left: 96 }} />
          <svg
            className="mascot__mouth"
            width="40"
            height="18"
            viewBox="0 0 40 18"
            aria-hidden="true"
          >
            <path
              d="M3 4c8 12 26 12 34 0"
              fill="none"
              stroke="#1B1F24"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
          <i className="mascot__arm" />
          <i className="mascot__selection" />
        </div>
        <span className="vector-state">Estado: Acenando</span>
      </div>
      <div className="vector-timeline">
        <div className="vector-timeline__tabs">
          <span className="is-active">Acenar</span>
          <span>Piscar</span>
          <span>Pular</span>
          <span className="mock-chip">Exportar SVG animado</span>
        </div>
        <span className="ruler" />
        <div className="keyframes">
          <i style={{ left: "6%" }} />
          <i style={{ left: "30%" }} />
          <i style={{ left: "55%" }} />
          <i style={{ left: "82%" }} />
          <b />
        </div>
      </div>
    </div>
  );
}

export function AssistantMock() {
  return (
    <div
      className="mock chat"
      role="img"
      aria-label="Conversa com o assistente do EdiAula: o pedido para limpar a aula e sugerir capítulos, e a resposta com uma proposta de 32 cortes para aplicar ou descartar."
    >
      <div className="chat__head">
        <span>Assistente do EdiAula</span>
        <span className="chat__engine">motor: Claude Code</span>
      </div>
      <p className="chat__me">Limpe a aula aberta e sugira os capítulos.</p>
      <p className="chat__ai">
        Encontrei 23 vícios de fala e 9 silêncios longos. Deixei tudo como proposta na timeline, sem
        aplicar. Também sugeri 4 capítulos.
      </p>
      <div className="chat__proposal">
        <span>
          <strong>Proposta</strong> · 32 cortes · menos 1 min 42 s
        </span>
        <span className="chat__actions">
          <span className="mock-chip mock-chip--ghost">Descartar</span>
          <span className="mock-chip mock-chip--tool" style={toolStyle("ediaula")}>
            Aplicar
          </span>
        </span>
      </div>
    </div>
  );
}

export const TOOL_ILLUSTRATIONS = {
  ediaula: TranscriptMock,
  edicaptura: CaptureMock,
  edifoto: PhotoMock,
  edipdf: PdfMock,
  edisvg: VectorMock,
} as const;
