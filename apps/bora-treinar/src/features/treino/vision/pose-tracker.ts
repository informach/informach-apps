import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../body/landmarks";
import { MODELOS, type ModeloPose, WASM_BASE } from "./assets";

export interface PoseFrame {
  /** pontos 3D em metros, centrados no quadril (usados na contagem) */
  world: Landmark[];
  /** pontos normalizados 0..1 na imagem (usados no desenho sobre a câmera) */
  image: Landmark[];
  t: number;
}

/**
 * WASM e modelos servidos pela própria origem (scripts/fetch-assets.mjs), com a versão do pacote
 * no caminho do WASM (`vision/assets.ts`).
 */
const landmarkers = new Map<ModeloPose, Promise<PoseLandmarker>>();

/**
 * Baixa o modelo acompanhando o progresso (0..1), para o portão "Pronto?" mostrar a barra em vez
 * de uma tela parada. Na segunda vez ele vem do cache do service worker, quase na hora.
 */
async function baixarModelo(modelo: ModeloPose, aoProgresso?: (p: number) => void) {
  const resposta = await fetch(MODELOS[modelo]);
  if (!resposta.ok) throw new Error("Não foi possível baixar o detector de pose.");
  const total = Number(resposta.headers.get("content-length")) || 0;
  if (!resposta.body || !total) {
    const tudo = new Uint8Array(await resposta.arrayBuffer());
    aoProgresso?.(1);
    return tudo;
  }
  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let recebido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    recebido += value.length;
    aoProgresso?.(Math.min(1, recebido / total));
  }
  const tudo = new Uint8Array(recebido);
  let pos = 0;
  for (const parte of partes) {
    tudo.set(parte, pos);
    pos += parte.length;
  }
  aoProgresso?.(1);
  return tudo;
}

/** Carrega (uma vez por modelo) o detector. Pode ser chamado antes, para adiantar o download. */
export function carregarDetector(modelo: ModeloPose = "full", aoProgresso?: (p: number) => void) {
  let pronto = landmarkers.get(modelo);
  if (!pronto) {
    pronto = (async () => {
      // carregado sob demanda: só quem usa a câmera baixa o detector
      const [{ FilesetResolver, PoseLandmarker }, buffer] = await Promise.all([
        import("@mediapipe/tasks-vision"),
        baixarModelo(modelo, aoProgresso),
      ]);
      const files = await FilesetResolver.forVisionTasks(WASM_BASE);
      const opts = (delegate: "GPU" | "CPU") => ({
        baseOptions: { modelAssetBuffer: buffer, delegate },
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
    pronto.catch(() => landmarkers.delete(modelo));
    landmarkers.set(modelo, pronto);
  } else aoProgresso?.(1);
  return pronto;
}

/** Abre a câmera e roda o detector de pose quadro a quadro, tudo no aparelho. Nenhuma imagem sai do dispositivo. */
export class PoseTracker {
  readonly video = document.createElement("video");
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  private listeners = new Set<(f: PoseFrame | null) => void>();
  private aoPararCb: (() => void) | null = null;
  private stamps: number[] = [];
  fps = 0;

  constructor(private readonly modelo: ModeloPose = "full") {
    this.video.playsInline = true;
    this.video.muted = true;
  }

  /**
   * A câmera parou sozinha (outro app pegou a câmera, o iPhone desligou o vídeo em segundo
   * plano): quem chamou mostra "A câmera parou" com a opção de tentar de novo.
   */
  aoParar(fn: () => void) {
    this.aoPararCb = fn;
  }

  on(fn: (f: PoseFrame | null) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** `aoProgresso`: quanto do modelo já baixou (0 a 1), para a barra do portão "Pronto?" */
  async start(facingMode: "user" | "environment" = "user", aoProgresso?: (p: number) => void) {
    if (!navigator.mediaDevices?.getUserMedia)
      // fora de HTTPS (e de localhost) o navegador esconde a câmera de propósito
      throw new Error(
        window.isSecureContext
          ? "Este navegador não dá acesso à câmera."
          : "A câmera só liga em conexão segura (https://).",
      );
    const [lm, stream] = await Promise.all([
      carregarDetector(this.modelo, aoProgresso),
      navigator.mediaDevices.getUserMedia({
        // 30 quadros e mais resolução quando o aparelho dá: repetição rápida (polichinelo) some
        // entre quadros a 15 fps, e o corpo inteiro de longe fica com poucos pixels a 640×480
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      }),
    ]);
    this.stream = stream;
    for (const track of stream.getVideoTracks())
      track.addEventListener("ended", () => {
        if (this.stream === stream) this.aoPararCb?.();
      });
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
