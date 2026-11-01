// Coloca em public/mediapipe o runtime WASM do MediaPipe (copiado do pacote
// instalado) e o modelo de pose (baixado por URL fixa e conferido por SHA-256).
// Roda antes do dev e do build: o detector de pose roda no aparelho e precisa
// desses arquivos servidos pela própria origem, sem CDN de terceiros.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
// O pacote não exporta package.json; a pasta wasm fica ao lado do módulo de entrada.
const wasmSrc = join(app, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(app, "public/mediapipe/wasm");
const modelDst = join(app, "public/mediapipe/pose_landmarker_full.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const MODEL_SHA256 = "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

mkdirSync(wasmDst, { recursive: true });
cpSync(wasmSrc, wasmDst, { recursive: true });

if (!existsSync(modelDst) || sha256(readFileSync(modelDst)) !== MODEL_SHA256) {
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`[bora] Falha ao baixar o modelo de pose: ${response.status}`);
  const model = Buffer.from(await response.arrayBuffer());
  if (sha256(model) !== MODEL_SHA256)
    throw new Error("[bora] O modelo de pose baixado não confere com o SHA-256 esperado.");
  mkdirSync(dirname(modelDst), { recursive: true });
  writeFileSync(modelDst, model);
  console.log("[bora] Modelo de pose baixado e conferido.");
}
