import { validateScene } from "./scene.js";
export const PROJECT_VERSION = 2;
export function newProject() {
  return parseProject({
    version: 1,
    name: "Sem título",
    animation: "Parado",
    transforms: {},
    keys: [],
    keysByAnimation: { Parado: [], Acenar: [], Pular: [] },
    scene: { viewBox: [0, 0, 1080, 1080], nodes: [] },
  });
}
const bounds = {
  x: [-10000, 10000],
  y: [-10000, 10000],
  rotation: [-3600, 3600],
  opacity: [0, 100],
  sx: [0.01, 20],
  sy: [0.01, 20],
};
export function validateTransform(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Transformação inválida.");
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const range = bounds[key];
    if (
      !Object.hasOwn(bounds, key) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < range[0] ||
      value > range[1]
    )
      throw new Error(`Valor inválido: ${key}`);
    out[key] = value;
  }
  return out;
}
export function parseProject(value) {
  if (
    !value ||
    ![1, 2].includes(value.version) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 120
  )
    throw new Error("Arquivo de projeto incompatível.");
  if (!["Parado", "Acenar", "Pular"].includes(value.animation))
    throw new Error("Animação inválida.");
  const transforms = {
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 100,
    sx: 1,
    sy: 1,
    ...validateTransform(value.transforms),
  };
  const frames = { Parado: 120, Acenar: 72, Pular: 48 }[value.animation];
  if (
    !Array.isArray(value.keys) ||
    value.keys.length > 1000 ||
    value.keys.some((x) => !Number.isInteger(x) || x < 0 || x > frames)
  )
    throw new Error("Quadros inválidos.");
  const keysByAnimation = {};
  for (const [name, total] of Object.entries({ Parado: 120, Acenar: 72, Pular: 48 })) {
    const keys =
      name === value.animation
        ? value.keys
        : (value.keysByAnimation?.[name] ?? [0, total / 4, total / 2, total]);
    if (
      !Array.isArray(keys) ||
      keys.length > 1000 ||
      keys.some((k) => !Number.isInteger(k) || k < 0 || k > total)
    )
      throw new Error(`Chaves inválidas: ${name}`);
    keysByAnimation[name] = [...new Set(keys)].sort((a, b) => a - b);
  }
  const modes = { Parado: "loop", Acenar: "ping-pong", Pular: "once", ...value.modes };
  if (
    Object.keys(modes).length !== 3 ||
    Object.values(modes).some((mode) => !["loop", "ping-pong", "once"].includes(mode))
  )
    throw new Error("Modo de reprodução inválido.");
  const inputs = { humor: 0.6, acenando: false, ...value.inputs };
  if (
    typeof inputs.humor !== "number" ||
    !Number.isFinite(inputs.humor) ||
    inputs.humor < 0 ||
    inputs.humor > 1 ||
    typeof inputs.acenando !== "boolean"
  )
    throw new Error("Inputs inválidos.");
  return {
    version: PROJECT_VERSION,
    name: value.name,
    animation: value.animation,
    transforms,
    keys: keysByAnimation[value.animation],
    keysByAnimation,
    modes,
    inputs: { humor: inputs.humor, acenando: inputs.acenando },
    scene: validateScene(value.scene),
  };
}
export function snapshot(state) {
  return parseProject({
    version: 1,
    name: state.name,
    animation: state.animation,
    transforms: state.transforms,
    keys: state.keys,
    keysByAnimation: state.keysByAnimation,
    modes: state.modes,
    inputs: { humor: state.humor ?? 0.6, acenando: state.waving ?? false },
    scene: state.scene,
  });
}
