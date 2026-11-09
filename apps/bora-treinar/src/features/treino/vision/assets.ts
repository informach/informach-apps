/**
 * Onde o detector de pose está, servido pela própria origem (scripts/fetch-assets.mjs).
 *
 * O WASM fica numa pasta com a versão do `@mediapipe/tasks-vision`: o service worker guarda o
 * detector para sempre, e com um caminho fixo uma atualização do pacote servia o JavaScript novo
 * com o WASM velho do cache. Ao atualizar o pacote, troque esta versão (um teste confere contra o
 * pacote instalado) e o nome do cache `DETECTOR` em `public/sw.js`.
 */
export const MEDIAPIPE_VERSION = "1.2.0";

export const WASM_BASE = `/mediapipe/wasm/${MEDIAPIPE_VERSION}`;

/**
 * `full` é o padrão, mais preciso na profundidade (agachamento visto de frente). `lite` é o modo
 * reduzido, escolhido no portão "Pronto?" quando o aparelho não passa de ~12 quadros por segundo.
 */
export const MODELOS = {
  full: "/mediapipe/pose_landmarker_full.task",
  lite: "/mediapipe/pose_landmarker_lite.task",
} as const;

export type ModeloPose = keyof typeof MODELOS;
