import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "../../src/features/backup/contrato";
import {
  conferirReferenciaDoArquivoCifrado,
  type ReferenciaDoArquivoCifrado,
} from "./arquivo-cifrado";
import {
  conferirReferenciaDoArquivoComposto,
  type ReferenciaDoArquivoComposto,
} from "./arquivo-composto";

const FORMATO = "recreio-indice-backup-v1",
  MAX = 32 * 1024,
  DOMINIO = Buffer.from("recreio:backup-index:v1\0", "utf8");
const Id = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  Sha = z.string().regex(/^[a-f0-9]{64}$/),
  Data = z.iso.datetime();
const Inventario = z.strictObject({
  quantidade: z.number().int().min(0).max(1_000_000),
  bytesCifrados: z
    .number()
    .int()
    .min(0)
    .max(64 * 1024 * 1024 * 1024),
  sha256: Sha,
});
const Base = {
  capturaId: z.uuid(),
  destino: DestinoDeCapturaSchema,
  source: z.string().regex(/^[a-f0-9]{40}$/),
};
const Corpo = z.discriminatedUnion("tipo", [
  z.strictObject({
    ...Base,
    tipo: z.literal("publicado"),
    iniciadaEm: Data,
    conferidaEm: Data,
    arquivo: z.unknown(),
    composto: z.unknown(),
    inventario: Inventario,
  }),
  z.strictObject({
    ...Base,
    tipo: z.literal("retirado"),
    registradaEm: Data,
    arquivoSha256Cifrado: Sha,
    motivo: z.enum(["abandonado", "retencao", "privacidade"]),
  }),
]);
const Envelope = z.strictObject({
  formato: z.literal(FORMATO),
  chaveId: Id,
  corpo: Corpo,
  mac: Sha,
});
export type PublicacaoDoBackup = {
  tipo: "publicado";
  capturaId: string;
  destino: DestinoDeCaptura;
  source: string;
  iniciadaEm: string;
  conferidaEm: string;
  arquivo: ReferenciaDoArquivoCifrado;
  composto: ReferenciaDoArquivoComposto;
  inventario: z.infer<typeof Inventario>;
};
export type RetiradaDoBackup = Extract<z.infer<typeof Corpo>, { tipo: "retirado" }>;
export type EstadoDaRetirada =
  | { tipo: "ausente" }
  | { tipo: "encontrada"; bytes: Uint8Array }
  | { tipo: "inconclusiva" };
export class FalhaDoIndiceDeRecuperacao extends Error {
  constructor(
    readonly codigo:
      | "CONFIGURACAO"
      | "LIMITE"
      | "INTEGRIDADE"
      | "CHAVE_INDISPONIVEL"
      | "INCONCLUSIVO"
      | "RETIRADO"
      | "ENCERRADO",
  ) {
    super(`recreio.backup_index.${codigo}`);
  }
}
function exigir(sim: unknown, codigo: FalhaDoIndiceDeRecuperacao["codigo"]): asserts sim {
  if (!sim) throw new FalhaDoIndiceDeRecuperacao(codigo);
}
const dataCanonica = (s: string) =>
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;

/** Metadados técnicos autenticados para recuperação sem o banco original.
 * Não autoriza restauração/retirada, não lê provedor e não resolve F7.
 * Mapas/chaves/destino são capacidades privadas da composição operacional. */
export function criarIndiceDeRecuperacao(config: {
  destino: DestinoDeCaptura;
  chaveAtiva: string;
  chaves: ReadonlyMap<string, Uint8Array>;
}) {
  const alvo = DestinoDeCapturaSchema.safeParse(config.destino),
    ativa = Id.safeParse(config.chaveAtiva),
    derivadas = new Map<string, Buffer>();
  exigir(
    alvo.success && ativa.success && config.chaves.size >= 1 && config.chaves.size <= 16,
    "CONFIGURACAO",
  );
  try {
    for (const [id, valor] of config.chaves) {
      exigir(
        Id.safeParse(id).success && valor instanceof Uint8Array && valor.length === 32,
        "CONFIGURACAO",
      );
      const ikm = Buffer.from(valor);
      try {
        derivadas.set(
          id,
          Buffer.from(hkdfSync("sha256", ikm, DOMINIO, Buffer.from(`indice:${id}`, "utf8"), 32)),
        );
      } finally {
        ikm.fill(0);
      }
    }
    exigir(derivadas.has(ativa.data), "CONFIGURACAO");
  } catch (e) {
    for (const k of derivadas.values()) k.fill(0);
    throw e;
  }
  const destino = alvo.data,
    chaveAtiva = ativa.data;
  let encerrado = false;
  function chave(id: string) {
    exigir(!encerrado, "ENCERRADO");
    const k = derivadas.get(id);
    exigir(k, "CHAVE_INDISPONIVEL");
    return k;
  }
  function corpo(bruto: unknown): PublicacaoDoBackup | RetiradaDoBackup {
    const r = Corpo.safeParse(bruto);
    exigir(r.success, "INTEGRIDADE");
    const v = r.data;
    exigir(
      v.destino.bucketId === destino.bucketId &&
        v.destino.bucketName === destino.bucketName &&
        v.destino.escopo === destino.escopo,
      "INTEGRIDADE",
    );
    if (v.tipo === "retirado") {
      exigir(dataCanonica(v.registradaEm), "INTEGRIDADE");
      return v;
    }
    let arquivo: ReferenciaDoArquivoCifrado, composto: ReferenciaDoArquivoComposto;
    try {
      arquivo = conferirReferenciaDoArquivoCifrado(v.arquivo);
      composto = conferirReferenciaDoArquivoComposto(v.composto);
    } catch {
      throw new FalhaDoIndiceDeRecuperacao("INTEGRIDADE");
    }
    exigir(
      dataCanonica(v.iniciadaEm) &&
        dataCanonica(v.conferidaEm) &&
        Date.parse(v.iniciadaEm) <= Date.parse(v.conferidaEm) &&
        arquivo.contexto.id === v.capturaId &&
        composto.capturaId === v.capturaId &&
        arquivo.bytes === composto.bytes &&
        arquivo.sha256 === composto.sha256,
      "INTEGRIDADE",
    );
    return { ...v, arquivo, composto };
  }
  function conferirChaveDoArquivo(v: PublicacaoDoBackup | RetiradaDoBackup) {
    if (v.tipo === "publicado") exigir(derivadas.has(v.arquivo.chaveId), "CHAVE_INDISPONIVEL");
  }
  function assinar(bruto: unknown): Buffer {
    exigir(!encerrado, "ENCERRADO");
    const v = corpo(bruto);
    conferirChaveDoArquivo(v);
    const semMac = { formato: FORMATO, chaveId: chaveAtiva, corpo: v };
    const mac = createHmac("sha256", chave(chaveAtiva))
      .update(DOMINIO)
      .update(JSON.stringify(semMac), "utf8")
      .digest("hex");
    const bytes = Buffer.from(JSON.stringify({ ...semMac, mac }), "utf8");
    exigir(bytes.length <= MAX, "LIMITE");
    return bytes;
  }
  function conferir(
    bytes: Uint8Array,
    capturaEsperada?: string,
  ): PublicacaoDoBackup | RetiradaDoBackup {
    exigir(!encerrado, "ENCERRADO");
    exigir(bytes instanceof Uint8Array && bytes.byteLength <= MAX, "LIMITE");
    if (capturaEsperada !== undefined)
      exigir(z.uuid().safeParse(capturaEsperada).success, "CONFIGURACAO");
    const copia = Buffer.from(bytes);
    let bruto: unknown;
    try {
      bruto = JSON.parse(copia.toString("utf8"));
    } catch {
      throw new FalhaDoIndiceDeRecuperacao("INTEGRIDADE");
    }
    const e = Envelope.safeParse(bruto);
    exigir(e.success, "INTEGRIDADE");
    const v = corpo(e.data.corpo);
    const semMac = { formato: FORMATO, chaveId: e.data.chaveId, corpo: v };
    exigir(
      Buffer.from(JSON.stringify({ ...semMac, mac: e.data.mac }), "utf8").equals(copia),
      "INTEGRIDADE",
    );
    const esperado = createHmac("sha256", chave(e.data.chaveId))
      .update(DOMINIO)
      .update(JSON.stringify(semMac), "utf8")
      .digest();
    exigir(timingSafeEqual(esperado, Buffer.from(e.data.mac, "hex")), "INTEGRIDADE");
    exigir(capturaEsperada === undefined || v.capturaId === capturaEsperada, "INTEGRIDADE");
    conferirChaveDoArquivo(v);
    return v;
  }
  function conferirDisponivel(
    publicacao: Uint8Array,
    retirada: EstadoDaRetirada,
    capturaId: string,
  ): PublicacaoDoBackup {
    const v = conferir(publicacao, capturaId);
    exigir(v.tipo === "publicado", "INTEGRIDADE");
    if (retirada.tipo === "inconclusiva") throw new FalhaDoIndiceDeRecuperacao("INCONCLUSIVO");
    if (retirada.tipo === "encontrada") {
      const r = conferir(retirada.bytes, capturaId);
      exigir(
        r.tipo === "retirado" && r.arquivoSha256Cifrado === v.arquivo.sha256Cifrado,
        "INTEGRIDADE",
      );
      throw new FalhaDoIndiceDeRecuperacao("RETIRADO");
    }
    exigir(retirada.tipo === "ausente", "INTEGRIDADE");
    return v;
  }
  return Object.freeze({
    assinar,
    conferir,
    conferirDisponivel,
    encerrar: () => {
      encerrado = true;
      for (const k of derivadas.values()) k.fill(0);
      derivadas.clear();
    },
  });
}
