import type { Skeleton } from "./skeleton";
import type { V3 } from "./vec";

/** Ponto do corpo no formato do MediaPipe Pose (worldLandmarks: metros, y para baixo). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** Índices do MediaPipe Pose usados pelo app (L = lado esquerdo da pessoa). */
export const MP = {
  nose: 0,
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
  ankleL: 27,
  ankleR: 28,
  toeL: 31,
  toeR: 32,
} as const;

/** Ligações desenhadas sobre a câmera. */
export const MP_BONES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 32],
];

/** Converte o esqueleto do instrutor em 33 landmarks (usado em testes e no modo demonstração). */
export function skeletonToLandmarks(
  sk: Skeleton,
  noise = 0,
  rand: () => number = Math.random,
): Landmark[] {
  const out: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const center: V3 = [
    (sk.j.hipL[0] + sk.j.hipR[0]) / 2,
    (sk.j.hipL[1] + sk.j.hipR[1]) / 2,
    (sk.j.hipL[2] + sk.j.hipR[2]) / 2,
  ];
  const put = (i: number, p: V3) => {
    const n = () => (rand() * 2 - 1) * noise;
    out[i] = {
      x: p[0] - center[0] + n(),
      y: -(p[1] - center[1]) + n(),
      z: p[2] - center[2] + n(),
      visibility: 0.99,
    };
  };
  put(MP.nose, sk.j.head);
  for (const [k, i] of Object.entries(MP)) if (k !== "nose") put(i, sk.j[k as keyof Skeleton["j"]]);
  return out;
}
