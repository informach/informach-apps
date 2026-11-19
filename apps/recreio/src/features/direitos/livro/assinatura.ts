import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  CabecalhoDeDireitosSchema,
  ChaveDoLivroSchema,
  FalhaDoLivroDeDireitos,
  IdDoLivroSchema,
  IntencaoDeDireitosSchema,
  ShaDoLivroSchema,
} from "./contrato";

export const MAX_REGISTRO = 32 * 1024;
const Envelope = z.strictObject({
  versao: z.literal(1),
  chaveId: ChaveDoLivroSchema,
  documento: z.union([CabecalhoDeDireitosSchema, IntencaoDeDireitosSchema]),
  mac: ShaDoLivroSchema,
});
export const resumoDoRegistro = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Assinatura privada, separada dos tokens de jogo e do MAC do backup.
 * A autoridade pessoal/consentimento pertence ao repository, não a este codec. */
export function criarAssinaturaDoLivro(config: {
  livroId: string;
  chaveAtiva: string;
  chaves: ReadonlyMap<string, Uint8Array>;
}) {
  const id = IdDoLivroSchema.safeParse(config.livroId),
    ativa = ChaveDoLivroSchema.safeParse(config.chaveAtiva),
    chaves = new Map<string, Buffer>();
  if (!id.success || !ativa.success || config.chaves.size < 1 || config.chaves.size > 16)
    throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
  const livroId = id.data,
    chaveAtiva = ativa.data;
  try {
    for (const [kid, key] of config.chaves) {
      if (!ChaveDoLivroSchema.safeParse(kid).success || key.length !== 32)
        throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      chaves.set(
        kid,
        Buffer.from(hkdfSync("sha256", key, livroId, "recreio.rights-ledger.mac.v1", 32)),
      );
    }
    if (!chaves.has(chaveAtiva)) throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
  } catch (erro) {
    for (const key of chaves.values()) key.fill(0);
    chaves.clear();
    throw erro;
  }
  let encerrado = false;
  const conferir = () => {
    if (encerrado) throw new FalhaDoLivroDeDireitos("ENCERRADO");
  };
  const falhar = (): never => {
    throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  };
  function assinar(documento: z.infer<typeof Envelope>["documento"]) {
    conferir();
    if (documento.livroId !== livroId) return falhar();
    const chave = chaves.get(chaveAtiva);
    if (!chave) return falhar();
    const corpo = { versao: 1, chaveId: chaveAtiva, documento },
      mac = createHmac("sha256", chave).update(JSON.stringify(corpo)).digest("hex"),
      bytes = Buffer.from(JSON.stringify({ ...corpo, mac }), "utf8");
    if (bytes.length > MAX_REGISTRO) return falhar();
    return bytes;
  }
  function ler(bytes: Uint8Array) {
    conferir();
    if (bytes.length < 1 || bytes.length > MAX_REGISTRO) return falhar();
    let bruto: unknown;
    try {
      bruto = JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch {
      return falhar();
    }
    const parsed = Envelope.safeParse(bruto);
    if (!parsed.success || parsed.data.documento.livroId !== livroId) return falhar();
    const e = parsed.data,
      key = chaves.get(e.chaveId);
    if (!key) return falhar();
    // Reemissão canônica recusa duplicatas, campos extras, UTF-8 inválido e
    // ambiguidades antes de aceitar o MAC, sem transportar o erro do parser.
    if (!Buffer.from(JSON.stringify(e), "utf8").equals(Buffer.from(bytes))) return falhar();
    const esperado = createHmac("sha256", key)
        .update(JSON.stringify({ versao: e.versao, chaveId: e.chaveId, documento: e.documento }))
        .digest(),
      recebido = Buffer.from(e.mac, "hex");
    try {
      if (!timingSafeEqual(esperado, recebido)) return falhar();
    } finally {
      esperado.fill(0);
      recebido.fill(0);
    }
    return e.documento;
  }
  return {
    livroId: livroId,
    assinarIntencao(entrada: unknown) {
      const p = IntencaoDeDireitosSchema.safeParse(entrada);
      if (!p.success) return falhar();
      return assinar(p.data);
    },
    assinarCabecalho(entrada: unknown) {
      const p = CabecalhoDeDireitosSchema.safeParse(entrada);
      if (!p.success) return falhar();
      return assinar(p.data);
    },
    lerIntencao(bytes: Uint8Array) {
      const p = IntencaoDeDireitosSchema.safeParse(ler(bytes));
      if (!p.success) return falhar();
      return p.data;
    },
    lerCabecalho(bytes: Uint8Array) {
      const p = CabecalhoDeDireitosSchema.safeParse(ler(bytes));
      if (!p.success) return falhar();
      return p.data;
    },
    encerrar() {
      encerrado = true;
      for (const key of chaves.values()) key.fill(0);
      chaves.clear();
    },
  };
}
