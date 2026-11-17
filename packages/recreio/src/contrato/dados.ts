import { z } from "zod";
import { base64ParaBytes, bytesParaBase64 } from "../transporte/bytes";

/** Cotas por perfil e jogo. O conteúdo é opaco para a plataforma. */
export const LIMITES_DOS_DADOS = {
  bytesPorVersao: 64 * 1024,
  chaves: 16,
  anteriores: 3,
  conflitos: 3,
  respostaBytes: 700 * 1024,
} as const;

export const ChaveDeDadosSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/);
export const RevisaoDeDadosSchema = z.number().int().min(0).max(2_147_483_646);
const Base64DeDadosSchema = z
  .string()
  .max(87_384)
  .refine((valor) => {
    try {
      const bytes = base64ParaBytes(valor);
      return bytes.length <= LIMITES_DOS_DADOS.bytesPorVersao && bytesParaBase64(bytes) === valor;
    } catch {
      return false;
    }
  }, "Dados fora do limite ou base64 não canônico.");

export const VersaoDeDadosSchema = z.strictObject({
  id: z.uuid(),
  revisaoBase: RevisaoDeDadosSchema,
  revisao: RevisaoDeDadosSchema.nullable(),
  estado: z.enum(["accepted", "conflict"]),
  conteudo: Base64DeDadosSchema,
  criadoEm: z.iso.datetime(),
});
export type VersaoDeDadosHttp = z.infer<typeof VersaoDeDadosSchema>;
export type VersaoDeDados = Omit<VersaoDeDadosHttp, "conteudo"> & { dados: Uint8Array };
export const DadoLidoSchema = z.strictObject({ versao: VersaoDeDadosSchema.nullable() });
export const VersoesDeDadosSchema = z.strictObject({
  revisaoAtual: RevisaoDeDadosSchema,
  versoes: z.array(VersaoDeDadosSchema).max(7),
});
export const DadosGravadosSchema = z.strictObject({ revisao: RevisaoDeDadosSchema });
export const DadosDescartadosSchema = z.strictObject({ descartado: z.literal(true) });

export const GravacaoDeDadosSchema = z.strictObject({
  operacao: z.literal("gravar"),
  chave: ChaveDeDadosSchema,
  revisao: RevisaoDeDadosSchema,
  conteudo: Base64DeDadosSchema,
});
export const MutacaoDeDadosSchema = z.discriminatedUnion("operacao", [
  GravacaoDeDadosSchema,
  z.strictObject({
    operacao: z.literal("resolver"),
    chave: ChaveDeDadosSchema,
    versaoId: z.uuid(),
    revisao: RevisaoDeDadosSchema,
  }),
  z.strictObject({
    operacao: z.literal("descartar"),
    chave: ChaveDeDadosSchema,
    versaoId: z.uuid(),
  }),
]);
export type MutacaoDeDados = z.infer<typeof MutacaoDeDadosSchema>;

export const PedidoDeConquistaSchema = z.strictObject({
  id: ChaveDeDadosSchema,
  chaveIdem: z.string().min(1).max(128),
});
export const ConquistaSchema = z.strictObject({
  id: ChaveDeDadosSchema,
  obtidaEm: z.iso.datetime(),
});

export interface DadosDoPerfil {
  ler(chave: string): Promise<VersaoDeDados | null>;
  /** Omitir revisão significa criar uma chave nova, nunca sobrescrever. */
  gravar(chave: string, dados: Uint8Array, revisao?: number): Promise<number>;
  versoes(chave: string): Promise<{ revisaoAtual: number; versoes: VersaoDeDados[] }>;
  resolver(chave: string, versaoId: string, revisao: number): Promise<number>;
  descartar(chave: string, versaoId: string): Promise<void>;
}
