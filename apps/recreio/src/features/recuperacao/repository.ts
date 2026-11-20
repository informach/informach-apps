import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, asc, db, desc, eq, gt, isNull, sql } from "@informach/db";
import {
  events,
  recreioSpaceJournal as journal,
  recreioSpaceLeases as leases,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, FOTOGRAFIAS_GUARDADAS, type MundoId } from "@informach/recreio";
import { DIARIO_RECUPERACAO_MAX_ENTRADAS } from "@informach/recreio/contrato";
import { z } from "zod";
import { FalhaDoObjetoPrivado } from "@/features/objetos/criptografia";
import { materializarFotografia, mesmaFotografia } from "@/features/objetos/fotografia";
import type {
  LeitorDeFotografiasPrivadas,
  ReferenciaDeFotografia,
} from "@/features/posse/armazenamento";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import { AGORA, type Transacao, travar } from "@/lib/repository";

export class RecusaDeRecuperacao extends Error {
  constructor(
    readonly codigo:
      | "NAO_ENCONTRADO"
      | "MUNDO_NAO_PARADO"
      | "INTEGRIDADE"
      | "LIMITE"
      | "MATERIAL_ALTERADO"
      | "ARMAZENAMENTO_INDISPONIVEL"
      | "OPERACAO_REUTILIZADA",
  ) {
    super(codigo);
    this.name = "RecusaDeRecuperacao";
  }
}

export type PedidoDeRecuperacao = {
  mundoId: MundoId;
  jogo: string;
  revisaoFonte: number;
  revisaoEsperada: number;
  operacaoId: string;
  motivo: string;
  fotografiaMaxBytes: number;
  diarioPendenteMaxBytes: number;
};

type Material = {
  mundo: {
    id: string;
    gameId: string;
    revision: number;
    journalSeq: number;
    leaseEpoch: number;
    schemaVersion: number;
  };
  foto: {
    revision: number;
    journalSeq: number;
    tick: number;
    schemaVersion: number;
    bytes: Uint8Array;
    sha256: string;
  };
  entradas: { seq: number; tick: number; fatoId: string; bytes: Uint8Array }[];
};
export type MaterialPreparado = {
  mundo: Material["mundo"];
  fonte: ReferenciaDeFotografia;
  entradas: Material["entradas"];
};
export type MaterialDeRecuperacao = Material & { impressao: string };
export type FotografiaRecuperada = { bytes: Uint8Array; tick: number; schemaVersion: number };

const ReciboSchema = z.object({
  app: z.literal("recreio"),
  operationId: z.uuid(),
  spaceId: z.uuid(),
  gameId: z.string(),
  sourceRevision: z.number().int().nonnegative(),
  previousRevision: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  journalSeq: z.number().int().nonnegative(),
  fence: z.number().int().nonnegative(),
  reasonCode: z.string(),
});
export type ReciboDeRecuperacao = z.infer<typeof ReciboSchema>;

function resumo(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function impressao(material: Material): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(material.mundo));
  hash.update(
    JSON.stringify({ ...material.foto, bytes: undefined, sha256: resumo(material.foto.bytes) }),
  );
  for (const entrada of material.entradas)
    hash.update(
      JSON.stringify({
        seq: entrada.seq,
        tick: entrada.tick,
        fatoId: entrada.fatoId,
        sha256: resumo(entrada.bytes),
      }),
    );
  return hash.digest("hex");
}

/** Mundo primeiro; nenhuma posse aberta, inclusive uma vencida ainda não
 * recolhida. O contexto de direitos é composição interna: o coordenador já
 * conferiu intenção/livro e mantém a operação sob lock. Não é autorização por
 * conhecer um UUID, nem parâmetro aceito pelo CLI ou por uma rota pública. */
export async function lerMaterial(
  tx: Transacao,
  pedido: PedidoDeRecuperacao,
  trava: "share" | "update",
  operacaoDeDireitos?: string,
): Promise<MaterialPreparado> {
  const [mundo] = await tx
    .select({
      id: spaces.id,
      gameId: spaces.gameId,
      status: spaces.status,
      rightsOperationId: spaces.rightsOperationId,
      rightsDraining: spaces.rightsDraining,
      revision: spaces.revision,
      journalSeq: spaces.journalSeq,
      leaseEpoch: spaces.leaseEpoch,
      schemaVersion: spaces.schemaVersion,
    })
    .from(spaces)
    .where(and(eq(spaces.id, pedido.mundoId), eq(spaces.gameId, pedido.jogo)))
    .for(trava);
  if (!mundo) throw new RecusaDeRecuperacao("NAO_ENCONTRADO");
  if (mundo.revision !== pedido.revisaoEsperada) throw new RecusaDeRecuperacao("MATERIAL_ALTERADO");
  const [posse] = await tx
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.spaceId, mundo.id), isNull(leases.releasedAt)))
    .limit(1);
  const parado = operacaoDeDireitos
    ? mundo.status === "archived" &&
      mundo.rightsDraining &&
      mundo.rightsOperationId === operacaoDeDireitos
    : mundo.status === "hibernating" && !mundo.rightsDraining && mundo.rightsOperationId === null;
  if (!parado || posse) throw new RecusaDeRecuperacao("MUNDO_NAO_PARADO");
  let fonte: ReferenciaDeFotografia | null;
  try {
    fonte = await armazenamentoPg.prepararLeituraDaFotografia(
      tx,
      pedido.mundoId,
      pedido.fotografiaMaxBytes,
      pedido.revisaoFonte,
    );
  } catch (erro) {
    if (erro instanceof ErroDoRecreio || erro instanceof FalhaDoObjetoPrivado)
      throw new RecusaDeRecuperacao("INTEGRIDADE");
    throw erro;
  }
  if (!fonte || fonte.meta.revisao > mundo.revision || fonte.meta.diarioSeq > mundo.journalSeq)
    throw new RecusaDeRecuperacao("INTEGRIDADE");
  const foto = { journalSeq: fonte.meta.diarioSeq };
  const filtro = and(
    eq(journal.spaceId, mundo.id),
    gt(journal.seq, foto.journalSeq),
    sql`${journal.seq} <= ${mundo.journalSeq}`,
  );
  // Orçamento real do bytea antes de transferir corpos. Fotografias retidas
  // podem precisar de mais diário que o checkpoint mais novo do runtime.
  const metas = await tx
    .select({
      seq: journal.seq,
      bytes: sql<number>`octet_length(${journal.payload})`.mapWith(Number),
    })
    .from(journal)
    .where(filtro)
    .orderBy(asc(journal.seq))
    .limit(DIARIO_RECUPERACAO_MAX_ENTRADAS + 1);
  if (
    metas.length > DIARIO_RECUPERACAO_MAX_ENTRADAS ||
    metas.reduce((n, e) => n + e.bytes, 0) >
      pedido.diarioPendenteMaxBytes * (operacaoDeDireitos ? 1 : FOTOGRAFIAS_GUARDADAS)
  )
    throw new RecusaDeRecuperacao("LIMITE");
  let seq = foto.journalSeq;
  for (const meta of metas) if (meta.seq !== ++seq) throw new RecusaDeRecuperacao("INTEGRIDADE");
  if (seq !== mundo.journalSeq) throw new RecusaDeRecuperacao("INTEGRIDADE");
  const linhas = await tx
    .select({
      seq: journal.seq,
      tick: journal.tick,
      fatoId: journal.factId,
      bytes: journal.payload,
    })
    .from(journal)
    .where(filtro)
    .orderBy(asc(journal.seq));
  return {
    mundo: {
      id: mundo.id,
      gameId: mundo.gameId,
      revision: mundo.revision,
      journalSeq: mundo.journalSeq,
      leaseEpoch: mundo.leaseEpoch,
      schemaVersion: mundo.schemaVersion,
    },
    fonte,
    entradas: linhas.map((e) => ({ ...e, bytes: new Uint8Array(e.bytes) })),
  };
}

export function montarMaterial(
  preparado: MaterialPreparado,
  bytes: Uint8Array,
): MaterialDeRecuperacao {
  const foto = preparado.fonte.meta;
  if (bytes.length !== foto.bytes || resumo(bytes) !== foto.sha256)
    throw new RecusaDeRecuperacao("INTEGRIDADE");
  const material: Material = {
    mundo: preparado.mundo,
    entradas: preparado.entradas,
    foto: {
      revision: foto.revisao,
      journalSeq: foto.diarioSeq,
      tick: foto.tick,
      schemaVersion: foto.schemaVersion,
      bytes,
      sha256: foto.sha256,
    },
  };
  return { ...material, impressao: impressao(material) };
}

export async function prepararRecuperacao(
  pedido: PedidoDeRecuperacao,
  leitor?: LeitorDeFotografiasPrivadas | null,
): Promise<MaterialDeRecuperacao> {
  const leitorEfetivo =
    leitor === undefined
      ? (await import("@/features/objetos/runtime")).leitorDeFotografias()
      : leitor;
  const base = await db.transaction((tx) => lerMaterial(tx, pedido, "share"));
  if (base.fonte.origem.tipo === "pg") return montarMaterial(base, base.fonte.origem.bytes);
  let bytes: Uint8Array;
  try {
    bytes = await materializarFotografia(base.fonte, leitorEfetivo);
  } catch {
    throw new RecusaDeRecuperacao("ARMAZENAMENTO_INDISPONIVEL");
  }
  try {
    const original = montarMaterial(base, bytes);
    return await db.transaction(async (tx) => {
      const atual = await lerMaterial(tx, pedido, "share");
      if (!mesmaFotografia(base.fonte, atual.fonte))
        throw new RecusaDeRecuperacao("MATERIAL_ALTERADO");
      const conferido = montarMaterial(atual, bytes);
      if (original.impressao !== conferido.impressao)
        throw new RecusaDeRecuperacao("MATERIAL_ALTERADO");
      return conferido;
    });
  } catch (erro) {
    bytes.fill(0);
    throw erro;
  }
}

async function lerRecibo(
  conexao: Pick<Transacao, "select">,
  pedido: PedidoDeRecuperacao,
): Promise<ReciboDeRecuperacao | null> {
  const [linha] = await conexao
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.eventType, "recreio.space_restored"),
        sql`${events.payload}->>'operationId' = ${pedido.operacaoId}`,
      ),
    )
    .limit(1);
  if (!linha) return null;
  const lido = ReciboSchema.safeParse(linha.payload);
  if (!lido.success) throw new RecusaDeRecuperacao("INTEGRIDADE");
  const recibo = lido.data;
  if (
    recibo.spaceId !== pedido.mundoId ||
    recibo.gameId !== pedido.jogo ||
    recibo.sourceRevision !== pedido.revisaoFonte ||
    recibo.previousRevision !== pedido.revisaoEsperada ||
    recibo.reasonCode !== pedido.motivo
  )
    throw new RecusaDeRecuperacao("OPERACAO_REUTILIZADA");
  return recibo;
}

export function reciboDeRecuperacao(
  pedido: PedidoDeRecuperacao,
): Promise<ReciboDeRecuperacao | null> {
  return lerRecibo(db, pedido);
}

/** Operação UUID → mundo. Nenhum outro escritor pede a trava desta operação. */
export function aplicarRecuperacao(
  pedido: PedidoDeRecuperacao,
  material: MaterialDeRecuperacao,
  foto: FotografiaRecuperada,
): Promise<ReciboDeRecuperacao> {
  if (
    !Number.isSafeInteger(foto.tick) ||
    foto.tick < material.foto.tick ||
    !Number.isSafeInteger(foto.schemaVersion) ||
    foto.schemaVersion < 1 ||
    foto.bytes.length > pedido.fotografiaMaxBytes ||
    foto.bytes.length === 0
  )
    throw new RecusaDeRecuperacao("INTEGRIDADE");
  return db.transaction(async (tx) => {
    await travar(tx, `recreio:restore:${pedido.operacaoId}`);
    const anterior = await lerRecibo(tx, pedido);
    if (anterior) return anterior;
    const preparada = await lerMaterial(tx, pedido, "update");
    // Bucket já foi materializado e conferido na preparação. Revalidar a fonte,
    // mundo, diário e SHA sob trava; a nova fotografia pg guarda estes bytes.
    const atual = montarMaterial(
      preparada,
      preparada.fonte.origem.tipo === "pg" ? preparada.fonte.origem.bytes : material.foto.bytes,
    );
    if (atual.impressao !== material.impressao) throw new RecusaDeRecuperacao("MATERIAL_ALTERADO");
    if (foto.schemaVersion < atual.mundo.schemaVersion)
      throw new RecusaDeRecuperacao("INTEGRIDADE");
    const revision = atual.mundo.revision + 1;
    await tx.insert(snapshots).values({
      spaceId: pedido.mundoId,
      revision,
      fence: atual.mundo.leaseEpoch,
      schemaVersion: foto.schemaVersion,
      journalSeq: atual.mundo.journalSeq,
      tick: foto.tick,
      kind: "hibernate",
      storage: "pg",
      data: Buffer.from(foto.bytes),
      byteSize: foto.bytes.length,
      sha256: resumo(foto.bytes),
    });
    await tx
      .update(spaces)
      .set({ revision, schemaVersion: foto.schemaVersion, updatedAt: AGORA })
      .where(eq(spaces.id, pedido.mundoId));
    const recibo: ReciboDeRecuperacao = {
      app: "recreio",
      operationId: pedido.operacaoId,
      spaceId: pedido.mundoId,
      gameId: pedido.jogo,
      sourceRevision: pedido.revisaoFonte,
      previousRevision: atual.mundo.revision,
      revision,
      journalSeq: atual.mundo.journalSeq,
      fence: atual.mundo.leaseEpoch,
      reasonCode: pedido.motivo,
    };
    // Não aparar nem compactar: a recuperação conserva o material anterior.
    await logAuditEventStrict("recreio.space_restored", null, recibo, { writer: tx });
    return recibo;
  });
}

/** Só metadados; o código do mundo e o estado dos moradores não saem no CLI. */
export async function fotografiasRetidas(mundoId: MundoId, jogo: string, antesDe?: number) {
  return db
    .select({
      revisao: snapshots.revision,
      revisaoAtual: spaces.revision,
      diarioAtual: spaces.journalSeq,
      diarioSeq: snapshots.journalSeq,
      tick: snapshots.tick,
      schemaVersion: snapshots.schemaVersion,
      tipo: snapshots.kind,
      bytes: snapshots.byteSize,
      sha256: snapshots.sha256,
    })
    .from(snapshots)
    .innerJoin(spaces, eq(spaces.id, snapshots.spaceId))
    .where(
      and(
        eq(spaces.id, mundoId),
        eq(spaces.gameId, jogo),
        antesDe === undefined ? undefined : sql`${snapshots.revision} < ${antesDe}`,
      ),
    )
    .orderBy(desc(snapshots.revision))
    .limit(100);
}
