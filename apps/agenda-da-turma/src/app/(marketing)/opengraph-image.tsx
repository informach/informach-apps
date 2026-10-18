import { ImageResponse } from "next/og";

export const alt = "Agenda da Turma: a rotina da escola não precisa morar na sua cabeça";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * A imagem do link compartilhado (WhatsApp, Instagram, buscadores). Sem ela, o
 * link da página de vendas aparecia sem figura no grupo da turma, que é onde
 * ele mais circula. Cores por extenso porque aqui não há CSS do app: são as do
 * tema claro.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "#ffffff",
        color: "#0d0d0d",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#006ffd" }}>
        agenda da turma
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.05 }}>
          A rotina da escola não precisa morar na sua cabeça.
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#444444" }}>
          Mande o recado do jeito que chegou. Você confere antes de salvar.
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {["Foto", "Mensagem", "Falar", "Escrever"].map((label) => (
          <div
            key={label}
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              border: "2px solid #d9d9d9",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
