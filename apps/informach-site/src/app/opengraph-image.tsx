import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = "Informach — Apps com IA pra dores reais do dia a dia.";
export const size = { width: 1200, height: 630 } as const;
export const contentType = "image/png";

export default async function Image() {
  const iconPath = join(process.cwd(), "src", "app", "icon.png");
  const iconBuffer = await readFile(iconPath);
  const iconDataUrl = `data:image/png;base64,${iconBuffer.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "80px",
        background: "linear-gradient(135deg, #173247 0%, #0F2030 60%, #0A1825 100%)",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "32px",
          marginBottom: "48px",
        }}
      >
        <img src={iconDataUrl} alt="" width={140} height={140} />
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: "-2px",
            lineHeight: 1,
          }}
        >
          Informach
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          maxWidth: 920,
          textAlign: "center",
          fontSize: 52,
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: "-1px",
        }}
      >
        <div style={{ display: "flex", color: "#ffffff" }}>Apps com IA pra dores reais</div>
        <div style={{ display: "flex", color: "#E89870" }}>do dia a dia.</div>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 56,
          fontSize: 24,
          opacity: 0.65,
          letterSpacing: "0.5px",
        }}
      >
        {SITE.url.replace("https://", "")}
      </div>
    </div>,
    { ...size },
  );
}
