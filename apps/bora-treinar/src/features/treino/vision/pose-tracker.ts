import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../body/landmarks";

export interface PoseFrame {
  /** pontos 3D em metros, centrados no quadril (usados na contagem) */
  world: Landmark[];
  /** pontos normalizados 0..1 na imagem (usados no desenho sobre a câmera) */
  image: Landmark[];
  t: number;
}

/** WASM e modelo servidos pela própria origem (scripts/fetch-assets.mjs). */
const base = "/";
let landmarker: Promise<PoseLandmarker> | null = null;

function loadLandmarker() {
  landmarker ??= (async () => {
    // carregado sob demanda: só quem usa a câmera baixa o detector
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: `${base}mediapipe/pose_landmarker_lite.task`, delegate },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      return await PoseLandmarker.createFromOptions(files, opts("GPU"));
    } catch {
      return await PoseLandmarker.createFromOptions(files, opts("CPU"));
    }
  })();
  landmarker.catch(() => (landmarker = null));
  return landmarker;
}

/** Abre a câmera e roda o detector de pose quadro a quadro, tudo no aparelho. Nenhuma imagem sai do dispositivo. */
export class PoseTracker {
  readonly video = document.createElement("video");
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  private listeners = new Set<(f: PoseFrame | null) => void>();
  private stamps: number[] = [];
  fps = 0;

  constructor() {
    this.video.playsInline = true;
    this.video.muted = true;
  }

  on(fn: (f: PoseFrame | null) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  async start(facingMode: "user" | "environment" = "user") {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Este navegador não dá acesso à câmera.");
    const [lm, stream] = await Promise.all([
      loadLandmarker(),
      navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      }),
    ]);
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = this.video.currentTime;
      const t = performance.now();
      const r = lm.detectForVideo(this.video, t);
      this.stamps.push(t);
      while (t - (this.stamps[0] ?? t) > 1000) this.stamps.shift();
      this.fps = this.stamps.length;
      const world = r.worldLandmarks[0];
      const image = r.landmarks[0];
      const frame = world && image ? { world, image, t } : null;
      for (const fn of this.listeners) fn(frame);
    };
    loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.video.srcObject = null;
  }
}
