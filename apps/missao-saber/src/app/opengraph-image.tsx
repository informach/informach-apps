import { ImageResponse } from "next/og";

export const alt = "Missão Saber. Uma descoberta por dia.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Imagem de compartilhamento gerada no build: as cores da marca, sem depender
   de um PNG que envelhece a cada mudança de texto. */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(135deg, #f5f1e4 0%, #dff3e8 100%)",
        color: "#1f2933",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: "#17B26A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 40,
            fontWeight: 700,
          }}
        >
          MS
        </div>
        <div style={{ fontSize: 36, fontWeight: 700 }}>Missão Saber</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.02,
          }}
        >
          <div>Uma descoberta.</div>
          <div>Um novo jeito de pensar.</div>
        </div>
        <div style={{ fontSize: 34, color: "#4b5563" }}>
          Matemática e educação financeira em missões autorais para o 6º e 7º ano.
        </div>
      </div>
      <div style={{ fontSize: 26, color: "#4b5563" }}>Um produto Informach</div>
    </div>,
    size,
  );
}
