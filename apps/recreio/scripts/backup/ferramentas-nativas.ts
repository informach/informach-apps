import { spawn } from "node:child_process";

export class FalhaDaFerramentaNativa extends Error {
  constructor(
    readonly codigo:
      | "FERRAMENTA_INDISPONIVEL"
      | "FERRAMENTA_FALHOU"
      | "FERRAMENTA_COM_AVISO"
      | "FERRAMENTA_INTERROMPIDA",
  ) {
    super(codigo);
  }
}
/** Não herdar credenciais/opções da origem nos processos do destino. */
export function ambienteNativo(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    LANG: "en_US.utf8",
    TZ: "UTC",
    ...extra,
  };
}
export async function ferramentaNativa(
  programa: "gosu" | "pg_dump" | "pg_restore",
  argumentos: string[],
  ambiente: NodeJS.ProcessEnv,
  opcoes: { entrada?: number; saida?: number; signal?: AbortSignal } = {},
) {
  if (opcoes.signal?.aborted) throw new FalhaDaFerramentaNativa("FERRAMENTA_INTERROMPIDA");
  const filho = spawn(programa, argumentos, {
    env: ambiente,
    stdio: [opcoes.entrada ?? "ignore", opcoes.saida ?? "ignore", "pipe"],
    windowsHide: true,
  });
  let indisponivel = false,
    aviso = false,
    interrompido = false,
    cauda = "";
  const fechado = new Promise<number | null>((resolve) => {
    filho.once("error", () => {
      indisponivel = true;
    });
    filho.once("close", resolve);
  });
  const stderr = filho.stderr;
  if (!stderr) {
    filho.kill("SIGKILL");
    await fechado;
    throw new FalhaDaFerramentaNativa("FERRAMENTA_INDISPONIVEL");
  }
  stderr.on("data", (b: Buffer) => {
    // Só manter a cauda necessária para detectar palavra dividida entre chunks.
    const texto = cauda + b.toString("utf8");
    if (/\bwarning\b/i.test(texto)) aviso = true;
    cauda = texto.slice(-16);
  });
  const cancelar = () => {
    interrompido = true;
    filho.kill("SIGKILL");
  };
  opcoes.signal?.addEventListener("abort", cancelar, { once: true });
  const prazo = setTimeout(cancelar, 180_000);
  prazo.unref();
  if (opcoes.signal?.aborted) cancelar();
  try {
    const codigo = await fechado;
    if (interrompido) throw new FalhaDaFerramentaNativa("FERRAMENTA_INTERROMPIDA");
    if (indisponivel) throw new FalhaDaFerramentaNativa("FERRAMENTA_INDISPONIVEL");
    if (codigo !== 0) throw new FalhaDaFerramentaNativa("FERRAMENTA_FALHOU");
    if (aviso) throw new FalhaDaFerramentaNativa("FERRAMENTA_COM_AVISO");
  } finally {
    clearTimeout(prazo);
    opcoes.signal?.removeEventListener("abort", cancelar);
    cauda = "";
  }
}
