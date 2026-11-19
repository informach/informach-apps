import { z } from "zod";

export const ShaDoLivroSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ChaveDoLivroSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
export const IdDoLivroSchema = z.uuid().regex(/^[a-f0-9-]+$/);
const Instante = z.iso.datetime({ precision: 3 });
const Contador = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const RAIZ_VAZIA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** Registro privado de uma decisão já consentida. Não armazena e-mail,
 * nome, texto familiar, sessão ou segredo. Identificadores não são anônimos. */
export const IntencaoDeDireitosSchema = z
  .strictObject({
    formato: z.literal("recreio-intencao-direitos-v1"),
    livroId: IdDoLivroSchema,
    operacaoId: IdDoLivroSchema,
    revisao: Contador.min(1),
    tipo: z.enum(["retirar_perfil", "encerrar_conta"]),
    contaId: z.string().min(1).max(256),
    perfilIds: z.array(IdDoLivroSchema).max(256),
    planoSha256: ShaDoLivroSchema,
    consentidaEm: Instante,
    autenticadaEm: Instante,
    fonte: z.string().regex(/^[a-f0-9]{40}$/),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "retirar_perfil" && v.perfilIds.length !== 1)
      ctx.addIssue({ code: "custom", message: "invalid profile scope" });
    if (
      new Set(v.perfilIds).size !== v.perfilIds.length ||
      v.perfilIds.some((id, i) => {
        const anterior = v.perfilIds[i - 1];
        return anterior !== undefined && id <= anterior;
      })
    )
      ctx.addIssue({ code: "custom", message: "noncanonical scope" });
    if (Date.parse(v.autenticadaEm) > Date.parse(v.consentidaEm))
      ctx.addIssue({ code: "custom", message: "invalid authority time" });
  });

export const CabecalhoDeDireitosSchema = z
  .strictObject({
    formato: z.literal("recreio-livro-direitos-v1"),
    livroId: IdDoLivroSchema,
    estado: z.enum(["aberto", "congelado"]),
    geracao: Contador,
    entradas: Contador,
    raizSha256: ShaDoLivroSchema,
    anteriorSha256: ShaDoLivroSchema.nullable(),
    ultimaIntencao: z
      .strictObject({
        operacaoId: IdDoLivroSchema,
        revisao: Contador.min(1),
        sha256: ShaDoLivroSchema,
      })
      .nullable(),
    atualizadoEm: Instante,
  })
  .superRefine((v, ctx) => {
    if (
      (v.estado === "aberto" ? v.geracao !== v.entradas : v.geracao !== v.entradas + 1) ||
      (v.geracao === 0
        ? v.anteriorSha256 !== null || v.raizSha256 !== RAIZ_VAZIA || v.ultimaIntencao !== null
        : v.anteriorSha256 === null ||
          (v.entradas === 0
            ? v.raizSha256 !== RAIZ_VAZIA || v.ultimaIntencao !== null
            : v.ultimaIntencao === null))
    )
      ctx.addIssue({ code: "custom", message: "invalid ledger lineage" });
  });
export type IntencaoDeDireitos = z.infer<typeof IntencaoDeDireitosSchema>;
export type CabecalhoDeDireitos = z.infer<typeof CabecalhoDeDireitosSchema>;

export class FalhaDoLivroDeDireitos extends Error {
  constructor(
    readonly codigo:
      | "CONFIGURACAO"
      | "INTEGRIDADE"
      | "ENCERRADO"
      | "INCONCLUSIVO"
      | "AUSENTE"
      | "CONCORRENCIA"
      | "CONGELADO",
  ) {
    super(`recreio.rights_ledger.${codigo}`);
  }
}
