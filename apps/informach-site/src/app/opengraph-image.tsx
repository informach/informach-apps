import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_PRODUCTS, type SiteProduct } from "@/lib/products";
import { SITE } from "@/lib/site";

export const alt =
  "Informach: feito em casa, para a sua família. Programação para crianças, olimpíadas, rotina da escola, jantar da semana, treino em família e aulas gravadas.";
export const size = { width: 1200, height: 630 } as const;
export const contentType = "image/png";

/*
 * A imagem é gerada no build, lendo arquivos do disco. Cada caminho é literal:
 * caminho montado em tempo de execução faz o Next rastrear o projeto inteiro
 * para dentro do pacote standalone.
 */
const read = {
  sphere: () => readFile(join(process.cwd(), "src", "app", "icon.png")),
  wordmark: () => readFile(join(process.cwd(), "public", "logo-informach-dark.svg")),
  zappy: () => readFile(join(process.cwd(), "assets", "og", "zappy.png")),
  jakarta400: () => readFile(join(process.cwd(), "assets", "og", "PlusJakartaSans-400.ttf")),
  jakarta800: () => readFile(join(process.cwd(), "assets", "og", "PlusJakartaSans-800.ttf")),
};

const ICONS: Partial<Record<SiteProduct["slug"], () => Promise<Buffer>>> = {
  "missao-saber": () => readFile(join(process.cwd(), "public", "produtos", "missao-saber.png")),
  "agenda-da-turma": () =>
    readFile(join(process.cwd(), "public", "produtos", "agenda-da-turma.svg")),
  cozya: () => readFile(join(process.cwd(), "public", "produtos", "cozya.svg")),
  "bora-treinar": () => readFile(join(process.cwd(), "public", "produtos", "bora-treinar.png")),
  edi: () => readFile(join(process.cwd(), "public", "produtos", "edi.png")),
};

const toDataUrl = (bytes: Buffer, mime: string) =>
  `data:${mime};base64,${bytes.toString("base64")}`;
const mimeOf = (path: string) => (path.endsWith(".svg") ? "image/svg+xml" : "image/png");

async function productIcon(product: SiteProduct) {
  const load = ICONS[product.slug];
  if (!load) throw new Error(`Imagem social sem ícone para ${product.slug}`);
  return toDataUrl(await load(), mimeOf(product.icon));
}

export default async function Image() {
  const [sphereBytes, wordmarkBytes, zappyBytes, jakarta400, jakarta800, icons] = await Promise.all(
    [
      read.sphere(),
      read.wordmark(),
      read.zappy(),
      read.jakarta400(),
      read.jakarta800(),
      Promise.all(
        SITE_PRODUCTS.filter((product) => product.slug !== "sistema-zero").map(productIcon),
      ),
    ],
  );
  const sphere = toDataUrl(sphereBytes, "image/png");
  const wordmark = toDataUrl(wordmarkBytes, "image/svg+xml");
  const zappy = toDataUrl(zappyBytes, "image/png");
  const sistemaZero = SITE_PRODUCTS.find((product) => product.slug === "sistema-zero");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "#173247",
        color: "#F8F5EF",
        fontFamily: "Plus Jakarta Sans",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -150,
          top: -150,
          width: 560,
          height: 560,
          borderRadius: 9999,
          border: "2px dashed rgba(248,245,239,0.18)",
        }}
      />
      <img
        src={sphere}
        alt=""
        width={150}
        height={150}
        style={{ position: "absolute", right: 70, top: 70 }}
      />
      <img src={wordmark} alt="" width={254} height={52} />
      <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 820 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 0.98,
            letterSpacing: "-0.035em",
          }}
        >
          <div style={{ display: "flex" }}>Feito em casa, para a</div>
          <div style={{ display: "flex" }}>
            <span style={{ color: "#F0A979" }}>sua família</span>.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 400, color: "#D7E0E8" }}>
          Programação para crianças, olimpíadas, rotina da escola, jantar da semana, treino em
          família e aulas gravadas.
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            width: 54,
            height: 54,
            borderRadius: 16,
            overflow: "hidden",
            background: sistemaZero?.brand.background,
          }}
        >
          <img src={zappy} alt="" width={41} height={52} style={{ marginBottom: -4 }} />
        </div>
        {icons.map((icon) => (
          <img key={icon} src={icon} alt="" width={54} height={54} style={{ borderRadius: 16 }} />
        ))}
        <div style={{ display: "flex", marginLeft: 12, fontSize: 22, fontWeight: 800 }}>
          {SITE.url.replace("https://", "")}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Plus Jakarta Sans", data: jakarta400, weight: 400, style: "normal" },
        { name: "Plus Jakarta Sans", data: jakarta800, weight: 800, style: "normal" },
      ],
    },
  );
}
