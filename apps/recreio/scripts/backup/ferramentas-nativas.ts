import { spawn } from "node:child_process";

export type MotivoDaFerramentaNativa =
  | "OUTRO"
  | "SCHEMA"
  | "PERMISSAO"
  | "VINCULO"
  | "PAPEL"
  | "SINTAXE"
  | "CANCELAMENTO"
  | "CONEXAO"
  | "ARQUIVO";
export class FalhaDaFerramentaNativa extends Error {
  constructor(
    readonly codigo:
      | "FERRAMENTA_INDISPONIVEL"
      | "FERRAMENTA_FALHOU"
      | "FERRAMENTA_COM_AVISO"
      | "FERRAMENTA_INTERROMPIDA",
    readonly motivo: MotivoDaFerramentaNativa = "OUTRO",
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
  let motivo: MotivoDaFerramentaNativa = "OUTRO";
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
    // Classifications only: native errors can contain COPY rows, identifiers
    // and connection information. No raw stderr becomes an exception or log.
    if (/\bschema\b[^\n]{0,160}\bdoes not exist\b/i.test(texto)) motivo = "SCHEMA";
    else if (/\bpermission denied\b/i.test(texto)) motivo = "PERMISSAO";
    else if (/violates foreign key constraint|is not present in table/i.test(texto))
      motivo = "VINCULO";
    else if (/\brole\b[^\n]{0,160}\bdoes not exist\b/i.test(texto)) motivo = "PAPEL";
    else if (/syntax error/i.test(texto)) motivo = "SINTAXE";
    else if (/canceling statement due to user request/i.test(texto)) motivo = "CANCELAMENTO";
    else if (/could not connect|connection[^\n]{0,80}failed/i.test(texto)) motivo = "CONEXAO";
    else if (
      /could not read from input file|unexpected end of file|could not seek|unsupported version/i.test(
        texto,
      )
    )
      motivo = "ARQUIVO";
    cauda = texto.slice(-256);
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
    if (codigo !== 0) throw new FalhaDaFerramentaNativa("FERRAMENTA_FALHOU", motivo);
    if (aviso) throw new FalhaDaFerramentaNativa("FERRAMENTA_COM_AVISO");
  } finally {
    clearTimeout(prazo);
    opcoes.signal?.removeEventListener("abort", cancelar);
    cauda = "";
  }
}
