import { z } from "zod";
import { CatalogoDeAparenciasSchema, conferirContinuidadeDaAparencia } from "../comandos/aparencia";
import {
  AUTORES_DE_EDICAO_DO_MUNDO,
  RESPOSTAS_DE_EDICAO_DO_MUNDO,
  RegistroDeEdicoesSchema,
} from "../comandos/edicao";
import { conferirContinuidadeDaLoja } from "../comandos/loja";
import {
  CatalogoDePinturasSchema,
  conferirCatalogoDePinturas,
  PinturaDoMovelSchema,
} from "../comandos/pintura";
import { montarLojaInicial } from "../conteudo/loja";
import {
  CONTADOR_DE_REVISOES_DOS_OBJETOS,
  revisaoDosObjetos,
} from "../dominio/revisao-dos-objetos";
import type { EstadoDoMundo } from "../dominio/tipos";

/**
 * Fotografia: o estado durável de um mundo em um tick. É o que vai para o
 * armazenamento e o que volta na recuperação. Não leva presença nem caches.
 *
 * Cada formato tem `{ formato, versao }`. Um mundo antigo passa pela cadeia de
 * migrações antes de ser lido; um mundo de versão mais nova que este código é
 * recusado, nunca adivinhado.
 */

export const VERSAO_DO_MUNDO = 3;
export const VERSAO_DA_FOTOGRAFIA = 1;

const ReciboDeFundacaoSchema = z.strictObject({
  comandoId: z.string().min(8).max(64),
  autor: z.string().min(1).max(64),
  familiaId: z.string().regex(/^fam_\d+$/),
  resultado: z.strictObject({
    ok: z.literal(true),
    comandoId: z.string().min(8).max(64),
    tick: z.number().int().nonnegative(),
    versoes: z.record(z.string(), z.number().int().nonnegative()),
  }),
});

const EnvelopeSchema = z.object({
  formato: z.literal("morada.foto"),
  versao: z.number().int().positive(),
  mundoId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  estado: z.looseObject({
    formato: z.literal("morada.mundo"),
    versao: z.number().int().positive(),
    id: z.string().min(1),
    relogio: z.looseObject({ tick: z.number().int().nonnegative() }),
  }),
});

/** Confere a origem antes de qualquer migração; a versão migrada pode ser maior. */
export function conferirMetadadosDaFotografia(
  bruto: unknown,
  esperado: { mundoId: string; tick: number; versaoDoMundo: number },
): boolean {
  const lida = EnvelopeSchema.safeParse(bruto);
  if (!lida.success) return false;
  const foto = lida.data;
  return (
    foto.versao === VERSAO_DA_FOTOGRAFIA &&
    foto.mundoId === esperado.mundoId &&
    foto.estado.id === esperado.mundoId &&
    foto.tick === esperado.tick &&
    foto.estado.relogio.tick === esperado.tick &&
    foto.estado.versao === esperado.versaoDoMundo
  );
}

export type Fotografia = {
  formato: "morada.foto";
  versao: typeof VERSAO_DA_FOTOGRAFIA;
  mundoId: string;
  tick: number;
  estado: EstadoDoMundo;
};

/** Um passo da cadeia: leva o mundo da versão `de` para `de + 1`. */
export type Migracao = {
  de: number;
  migrar(estado: Record<string, unknown>): Record<string, unknown>;
};

/** V2 admite a fundação durável; mundos antigos conservam moradores, relações e saldos. */
export const MIGRACOES_DO_MUNDO: readonly Migracao[] = [
  { de: 1, migrar: (estado) => ({ ...estado, fundacao: null, catalogoDeAparencias: null }) },
  {
    de: 2,
    migrar: (estado) => {
      const objetos = z
        .object({
          ordem: z.array(z.string()),
          porId: z.record(z.string(), z.record(z.string(), z.unknown())),
        })
        .parse(estado.objetos);
      return {
        ...estado,
        loja: montarLojaInicial(),
        edicoes: [],
        catalogoDePinturas: null,
        contadores: {
          ...z
            .record(z.string(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
            .parse(estado.contadores),
          [CONTADOR_DE_REVISOES_DOS_OBJETOS]: 1,
        },
        objetos: {
          ordem: objetos.ordem,
          porId: Object.fromEntries(
            Object.entries(objetos.porId).map(([id, objeto]) => [
              id,
              { ...objeto, revisao: 1, pintura: null },
            ]),
          ),
        },
      };
    },
  },
];

export function migrar(
  estado: Record<string, unknown>,
  ate: number,
  migracoes: readonly Migracao[],
): Record<string, unknown> {
  let atual = estado;
  let versao = Number(atual.versao);
  if (!Number.isInteger(versao) || versao < 1) throw new Error("Mundo sem versão de formato");
  if (versao > ate) {
    throw new Error(`Mundo da versão ${versao}; este servidor lê até a versão ${ate}`);
  }
  while (versao < ate) {
    const passo = migracoes.find((migracao) => migracao.de === versao);
    if (!passo) throw new Error(`Falta a migração da versão ${versao} para a ${versao + 1}`);
    atual = { ...passo.migrar(atual), versao: versao + 1 };
    versao++;
  }
  return atual;
}

/** Confere o envelope, migra se preciso e devolve a fotografia pronta para restaurar. */
export function abrirFotografia(bruto: unknown): Fotografia {
  const envelope = EnvelopeSchema.parse(bruto);
  if (envelope.versao !== VERSAO_DA_FOTOGRAFIA) {
    throw new Error(`Fotografia da versão ${envelope.versao} não é lida por este servidor`);
  }
  const estado = { ...migrar(envelope.estado, VERSAO_DO_MUNDO, MIGRACOES_DO_MUNDO) };
  if (!ReciboDeFundacaoSchema.nullable().safeParse(estado.fundacao).success)
    throw new Error("Recibo de fundação inválido");
  const catalogo = CatalogoDeAparenciasSchema.nullable().safeParse(estado.catalogoDeAparencias);
  if (!catalogo.success) throw new Error("Catálogo de aparências inválido");
  if (catalogo.data) conferirContinuidadeDaAparencia(catalogo.data);
  estado.loja = conferirContinuidadeDaLoja(estado.loja);
  const pinturas = CatalogoDePinturasSchema.nullable().parse(estado.catalogoDePinturas);
  estado.catalogoDePinturas = pinturas ? conferirCatalogoDePinturas(pinturas) : null;
  const edicoes = z
    .array(RegistroDeEdicoesSchema)
    .max(AUTORES_DE_EDICAO_DO_MUNDO)
    .parse(estado.edicoes);
  if (
    new Set(edicoes.map((r) => r.autor)).size !== edicoes.length ||
    edicoes.reduce((total, r) => total + r.recentes.length, 0) > RESPOSTAS_DE_EDICAO_DO_MUNDO
  )
    throw new Error("Registros de edição repetidos ou acima do limite");
  estado.edicoes = edicoes;
  const contadores = z
    .record(z.string(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
    .parse(estado.contadores);
  const revisaoGlobal = revisaoDosObjetos({ contadores });
  z.object({
    porId: z.record(
      z.string(),
      z.object({
        revisao: z.number().int().positive().max(revisaoGlobal),
        pintura: PinturaDoMovelSchema.nullable(),
      }),
    ),
  }).parse(estado.objetos);
  if (estado.id !== envelope.mundoId) throw new Error("A fotografia é de outro mundo");
  return {
    formato: "morada.foto",
    versao: VERSAO_DA_FOTOGRAFIA,
    mundoId: envelope.mundoId,
    tick: envelope.tick,
    estado: estado as unknown as EstadoDoMundo,
  };
}
