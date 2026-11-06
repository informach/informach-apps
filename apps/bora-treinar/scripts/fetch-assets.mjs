// Coloca em public/mediapipe o runtime WASM do MediaPipe (copiado do pacote
// instalado) e os modelos de pose (baixados por URL fixa e conferidos por SHA-256).
// Roda antes do dev e do build: o detector de pose roda no aparelho e precisa
// desses arquivos servidos pela própria origem, sem CDN de terceiros.
//
// O WASM vai para uma pasta com a versão do pacote (public/mediapipe/wasm/<versão>/).
// O service worker guarda o detector para sempre (cache-first); com o nome fixo, uma
// atualização do pacote servia o JavaScript novo com o WASM velho do cache. A versão
// no caminho faz cada versão ser outro arquivo. `src/features/treino/vision/assets.ts`
// diz ao navegador qual versão usar, e um teste confere que as duas batem.
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const pacote = join(app, "node_modules/@mediapipe/tasks-vision");
// O pacote não exporta package.json; lido direto do disco.
const { version } = JSON.parse(readFileSync(join(pacote, "package.json"), "utf8"));
const wasmSrc = join(pacote, "wasm");
const wasmRaiz = join(app, "public/mediapipe/wasm");
const wasmDst = join(wasmRaiz, version);

const MODELOS = [
  {
    // o mais preciso, principalmente na profundidade (agachamento visto de frente)
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    sha256: "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
    dst: join(app, "public/mediapipe/pose_landmarker_full.task"),
  },
  {
    // modo reduzido, para aparelhos que não passam de ~12 quadros por segundo com o full
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
    dst: join(app, "public/mediapipe/pose_landmarker_lite.task"),
  },
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

// versões antigas (e o WASM solto da versão anterior deste script) saem
if (existsSync(wasmRaiz))
  for (const nome of readdirSync(wasmRaiz)) {
    if (nome === version) continue;
    rmSync(join(wasmRaiz, nome), { recursive: true, force: true });
  }
mkdirSync(wasmDst, { recursive: true });
cpSync(wasmSrc, wasmDst, { recursive: true });

for (const modelo of MODELOS) {
  if (existsSync(modelo.dst) && statSync(modelo.dst).isFile())
    if (sha256(readFileSync(modelo.dst)) === modelo.sha256) continue;
  const response = await fetch(modelo.url);
  if (!response.ok) throw new Error(`[bora] Falha ao baixar ${modelo.url}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (sha256(buffer) !== modelo.sha256)
    throw new Error(`[bora] O modelo baixado de ${modelo.url} não confere com o SHA-256 esperado.`);
  mkdirSync(dirname(modelo.dst), { recursive: true });
  writeFileSync(modelo.dst, buffer);
  console.log(`[bora] Modelo de pose baixado e conferido: ${modelo.dst}`);
}
