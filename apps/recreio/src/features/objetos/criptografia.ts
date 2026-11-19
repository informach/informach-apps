import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

const MAGIA = Buffer.from("RCROBJ01", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CABECALHO_MAX = 768;
const LIMITE_TECNICO = 256 * 1024 * 1024;
const ChaveIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const ContextoSchema = z.strictObject({
  tipo: z.enum(["fotografia", "exportacao", "backup", "retirada"]),
  /** Mundo ou operação técnica, nunca nome, e-mail ou nascimento. */
  id: z.uuid(),
});
export type ContextoDoObjeto = z.infer<typeof ContextoSchema>;
const CabecalhoSchema = z.strictObject({
  versao: z.literal(1),
  chaveId: ChaveIdSchema,
  contexto: ContextoSchema,
  bytes: z.number().int().min(0).max(LIMITE_TECNICO),
});
const ShaSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ReferenciaSchema = z.strictObject({
  formato: z.literal("recreio-objeto-cifrado-v1"),
  chaveId: ChaveIdSchema,
  contexto: ContextoSchema,
  bytes: z.number().int().min(0).max(LIMITE_TECNICO),
  sha256: ShaSchema,
  sha256Cifrado: ShaSchema,
  bytesCifrados: z
    .number()
    .int()
    .positive()
    .max(LIMITE_TECNICO + 1024),
});
export type ReferenciaDoObjeto = z.infer<typeof ReferenciaSchema>;
export class FalhaDoObjetoPrivado extends Error {
  constructor(readonly codigo: "CONFIGURACAO" | "LIMITE" | "INTEGRIDADE" | "CHAVE_INDISPONIVEL") {
    super(`recreio.private_object.${codigo}`);
    this.name = "FalhaDoObjetoPrivado";
  }
}
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const shaConfere = (bytes: Uint8Array, esperado: string) =>
  timingSafeEqual(Buffer.from(sha256(bytes), "hex"), Buffer.from(esperado, "hex"));
const mesmoContexto = (a: ContextoDoObjeto, b: ContextoDoObjeto) =>
  a.tipo === b.tipo && a.id === b.id;

export function conferirReferenciaDoObjeto(bruto: unknown): ReferenciaDoObjeto {
  const lida = ReferenciaSchema.safeParse(bruto);
  if (!lida.success) throw new FalhaDoObjetoPrivado("INTEGRIDADE");
  return lida.data;
}

/**
 * Envelope de objetos limitados em memória. Só usa AES-256-GCM do Node, IV
 * aleatório de 96 bits e tag de 128 bits. Cabeçalho/IV/contexto são autenticados.
 * Chaves vêm da composição privada e não acompanham referência ou conteúdo.
 * Não realiza rede, persistência, autorização ou migração. Backups maiores que
 * o teto exigem executor de arquivo/stream próprio; nunca truncar para caber.
 */
export function criarCifradorDeObjetos(config: {
  chaveAtiva: string;
  chaves: ReadonlyMap<string, Uint8Array>;
  limiteBytes: number;
}) {
  if (
    !ChaveIdSchema.safeParse(config.chaveAtiva).success ||
    !Number.isSafeInteger(config.limiteBytes) ||
    config.limiteBytes < 1 ||
    config.limiteBytes > LIMITE_TECNICO ||
    config.chaves.size < 1 ||
    config.chaves.size > 16
  )
    throw new FalhaDoObjetoPrivado("CONFIGURACAO");
  const chaves = new Map<string, Buffer>();
  for (const [id, chave] of config.chaves) {
    if (
      !ChaveIdSchema.safeParse(id).success ||
      !(chave instanceof Uint8Array) ||
      chave.byteLength !== 32
    )
      throw new FalhaDoObjetoPrivado("CONFIGURACAO");
    chaves.set(id, Buffer.from(chave));
  }
  const ativa = (() => {
    const chave = chaves.get(config.chaveAtiva);
    if (!chave) throw new FalhaDoObjetoPrivado("CONFIGURACAO");
    return chave;
  })();
  const limiteBytes = config.limiteBytes;
  const chaveAtiva = config.chaveAtiva;

  function cifrar(contextoBruto: ContextoDoObjeto, conteudo: Uint8Array) {
    const contexto = ContextoSchema.safeParse(contextoBruto);
    if (!contexto.success) throw new FalhaDoObjetoPrivado("CONFIGURACAO");
    if (!(conteudo instanceof Uint8Array) || conteudo.byteLength > limiteBytes)
      throw new FalhaDoObjetoPrivado("LIMITE");
    const origem = Buffer.from(conteudo);
    try {
      const cabecalho = Buffer.from(
        JSON.stringify({
          versao: 1,
          chaveId: chaveAtiva,
          contexto: contexto.data,
          bytes: origem.length,
        }),
        "utf8",
      );
      if (cabecalho.length > CABECALHO_MAX) throw new FalhaDoObjetoPrivado("CONFIGURACAO");
      const tamanho = Buffer.alloc(2);
      tamanho.writeUInt16BE(cabecalho.length);
      const iv = randomBytes(IV_BYTES);
      const aad = Buffer.concat([MAGIA, tamanho, cabecalho, iv]);
      const cipher = createCipheriv("aes-256-gcm", ativa, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(aad);
      const bytes = Buffer.concat([
        aad,
        cipher.update(origem),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      const referencia: ReferenciaDoObjeto = {
        formato: "recreio-objeto-cifrado-v1",
        chaveId: chaveAtiva,
        contexto: contexto.data,
        bytes: origem.length,
        sha256: sha256(origem),
        sha256Cifrado: sha256(bytes),
        bytesCifrados: bytes.length,
      };
      return { referencia, bytes };
    } finally {
      origem.fill(0);
    }
  }

  /** A referência deve vir do recibo autoritativo; nunca dos metadados do bucket.
   * Nenhum byte aberto é devolvido antes de validar tag, tamanho e checksum. */
  function abrir(referenciaBruta: unknown, conteudo: Uint8Array): Buffer {
    const referencia = conferirReferenciaDoObjeto(referenciaBruta);
    if (
      referencia.bytes > limiteBytes ||
      !(conteudo instanceof Uint8Array) ||
      conteudo.byteLength > limiteBytes + MAGIA.length + 2 + CABECALHO_MAX + IV_BYTES + TAG_BYTES
    )
      throw new FalhaDoObjetoPrivado("LIMITE");
    if (
      conteudo.byteLength !== referencia.bytesCifrados ||
      conteudo.byteLength < MAGIA.length + 2 + 2 + IV_BYTES + TAG_BYTES
    )
      throw new FalhaDoObjetoPrivado("INTEGRIDADE");
    const bytes = Buffer.from(conteudo);
    if (
      !shaConfere(bytes, referencia.sha256Cifrado) ||
      !bytes.subarray(0, MAGIA.length).equals(MAGIA)
    )
      throw new FalhaDoObjetoPrivado("INTEGRIDADE");
    const tamanho = bytes.readUInt16BE(MAGIA.length);
    const fim = MAGIA.length + 2 + tamanho;
    if (
      tamanho < 2 ||
      tamanho > CABECALHO_MAX ||
      bytes.length !== fim + IV_BYTES + referencia.bytes + TAG_BYTES
    )
      throw new FalhaDoObjetoPrivado("INTEGRIDADE");
    let bruto: unknown;
    try {
      bruto = JSON.parse(bytes.subarray(MAGIA.length + 2, fim).toString("utf8"));
    } catch {
      throw new FalhaDoObjetoPrivado("INTEGRIDADE");
    }
    const cabecalho = CabecalhoSchema.safeParse(bruto);
    if (
      !cabecalho.success ||
      cabecalho.data.chaveId !== referencia.chaveId ||
      cabecalho.data.bytes !== referencia.bytes ||
      !mesmoContexto(cabecalho.data.contexto, referencia.contexto)
    )
      throw new FalhaDoObjetoPrivado("INTEGRIDADE");
    const chave = chaves.get(referencia.chaveId);
    if (!chave) throw new FalhaDoObjetoPrivado("CHAVE_INDISPONIVEL");
    const fimAad = fim + IV_BYTES;
    const decipher = createDecipheriv("aes-256-gcm", chave, bytes.subarray(fim, fimAad), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(bytes.subarray(0, fimAad));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    const parcial = decipher.update(bytes.subarray(fimAad, bytes.length - TAG_BYTES));
    try {
      const final = decipher.final();
      const aberto = Buffer.concat([parcial, final]);
      final.fill(0);
      if (aberto.length !== referencia.bytes || !shaConfere(aberto, referencia.sha256)) {
        aberto.fill(0);
        throw new FalhaDoObjetoPrivado("INTEGRIDADE");
      }
      return aberto;
    } catch {
      throw new FalhaDoObjetoPrivado("INTEGRIDADE");
    } finally {
      parcial.fill(0);
    }
  }
  return Object.freeze({
    cifrar,
    abrir,
    maxBytesAbertos: limiteBytes,
    maxBytesCifrados: limiteBytes + MAGIA.length + 2 + CABECALHO_MAX + IV_BYTES + TAG_BYTES,
  });
}
