import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, asc, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioSnapshotObjectDeliveries as deliveries,
  recreioBackupObjectHolds as holds,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import postgres from "postgres";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  BARREIRA_CAPTURA_COLETA,
  conferirObjetoDaCaptura,
  type DestinoDeCaptura,
  DestinoDeCapturaSchema,
  FalhaDaCaptura,
  type ObjetoDaCaptura,
  resumoDaReferencia,
} from "./contrato";

type Fonte = Pick<postgres.TransactionSql, "unsafe">;
export type CapturaAberta = {
  id: string;
  snapshot: string;
  signal: AbortSignal;
  origem: Fonte;
  inventario: { quantidade: number; bytesCifrados: number; sha256: string };
  objetos: () => AsyncGenerator<ObjetoDaCaptura>;
};

/** Mesma visão READ ONLY de pg_dump. LEFT JOIN faz fonte sem recibo falhar,
 * em vez de desaparecer silenciosamente do manifesto. Sem envelope em memória. */
async function* objetosNaVisao(fonte: Fonte): AsyncGenerator<ObjetoDaCaptura> {
  const cursor = fonte
    .unsafe<{ valido: boolean; objeto: unknown }[]>(`
    select
      coalesce(d.snapshot_reference=s.id and d.snapshot_id=s.id and
        d.space_id=s.space_id and d.plaintext_sha256=s.sha256 and
        d.plaintext_bytes=s.byte_size and d.object_key=s.object_key and
        d.state='verified' and d.verified_at is not null and d.envelope is null,false) as valido,
      jsonb_build_object(
        'entregaId',d.id,'fotografiaId',s.id,'mundoId',s.space_id,
        'bucketId',d.bucket_id,'bucketName',d.bucket_name,'escopo',d.storage_scope,'objectKey',s.object_key,
        'referencia',jsonb_build_object('formato','recreio-objeto-cifrado-v1','chaveId',d.encryption_key_id,
          'contexto',jsonb_build_object('tipo','fotografia','id',s.space_id),
          'bytes',d.plaintext_bytes,'sha256',d.plaintext_sha256,
          'sha256Cifrado',d.cipher_sha256,'bytesCifrados',d.cipher_bytes)) as objeto
    from recreio.space_snapshots s
    left join recreio.snapshot_object_deliveries d on d.snapshot_id=s.id
    where s.storage='bucket'
    order by s.id
  `)
    .cursor(100);
  for await (const lote of cursor)
    for (const linha of lote) {
      if (!linha.valido) throw new FalhaDaCaptura("INVENTARIO");
      yield conferirObjetoDaCaptura(linha.objeto);
    }
}

async function limitarControle(tx: Transacao) {
  await tx.execute(sql`select set_config('lock_timeout','5000ms',true),
    set_config('statement_timeout','15000ms',true),set_config('transaction_timeout','30000ms',true)`);
}
async function conferirBarreira(tx: Transacao, pid: number) {
  const [r] = await tx.execute<{ viva: boolean }>(sql`select exists (
    select 1 from pg_locks where locktype='advisory' and pid=${pid}
      and classid=${BARREIRA_CAPTURA_COLETA.grupo}::oid and objid=${BARREIRA_CAPTURA_COLETA.chave}::oid
      and objsubid=2 and mode='ExclusiveLock' and granted
      and database=(select oid from pg_database where datname=current_database())
  ) as viva`);
  if (!r?.viva) throw new FalhaDaCaptura("FONTE_ALTERADA");
}

/** Primeira trava do futuro coletor, antes do mundo/entrega. */
export async function travarColetaDeObjetos(tx: Transacao): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(${BARREIRA_CAPTURA_COLETA.grupo},${BARREIRA_CAPTURA_COLETA.chave})`,
  );
}

async function reservarLote(capturaId: string, lote: ObjetoDaCaptura[], pid: number) {
  if (!lote.length || lote.length > 100) throw new FalhaDaCaptura("LIMITE");
  await db.transaction(async (tx) => {
    await limitarControle(tx);
    const mundos = [...new Set(lote.map((o) => o.mundoId))].sort();
    const travados = await tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(inArray(spaces.id, mundos))
      .orderBy(asc(spaces.id))
      .for("update");
    if (travados.length !== mundos.length) throw new FalhaDaCaptura("FONTE_ALTERADA");
    const atuais = await tx
      .select({
        id: deliveries.id,
        snapshotReference: deliveries.snapshotReference,
        spaceId: deliveries.spaceId,
        bucketId: deliveries.bucketId,
        bucketName: deliveries.bucketName,
        escopo: deliveries.storageScope,
        objectKey: deliveries.objectKey,
        sha: deliveries.plaintextSha256,
        bytes: deliveries.plaintextBytes,
        cipherSha: deliveries.cipherSha256,
        cipherBytes: deliveries.cipherBytes,
        keyId: deliveries.encryptionKeyId,
        state: deliveries.state,
        verifiedAt: deliveries.verifiedAt,
      })
      .from(deliveries)
      .where(
        inArray(
          deliveries.id,
          lote.map((o) => o.entregaId),
        ),
      )
      .orderBy(asc(deliveries.id))
      .for("update");
    if (atuais.length !== lote.length) throw new FalhaDaCaptura("FONTE_ALTERADA");
    const [captura] = await tx
      .select({ state: captures.state })
      .from(captures)
      .where(eq(captures.id, capturaId))
      .for("update");
    if (captura?.state !== "preparing") throw new FalhaDaCaptura("CAPTURA_ENCERRADA");
    const porId = new Map(atuais.map((o) => [o.id, o]));
    for (const objeto of lote) {
      const atual = porId.get(objeto.entregaId);
      if (!atual?.verifiedAt || !["verified", "retiring", "review"].includes(atual.state))
        throw new FalhaDaCaptura("FONTE_ALTERADA");
      const referenciaAtual = conferirObjetoDaCaptura({
        entregaId: atual.id,
        fotografiaId: atual.snapshotReference,
        mundoId: atual.spaceId,
        bucketId: atual.bucketId,
        bucketName: atual.bucketName,
        escopo: atual.escopo,
        objectKey: atual.objectKey,
        referencia: {
          formato: "recreio-objeto-cifrado-v1",
          chaveId: atual.keyId,
          contexto: { tipo: "fotografia", id: atual.spaceId },
          bytes: atual.bytes,
          sha256: atual.sha,
          sha256Cifrado: atual.cipherSha,
          bytesCifrados: atual.cipherBytes,
        },
      });
      const resumo = resumoDaReferencia(objeto);
      if (resumoDaReferencia(referenciaAtual) !== resumo)
        throw new FalhaDaCaptura("FONTE_ALTERADA");
      await tx
        .insert(holds)
        .values({ captureId: capturaId, deliveryId: objeto.entregaId, referenceSha256: resumo });
    }
    // Se a coordenação caiu, uma nova coleta espera estas linhas até o commit
    // das reservas ou nosso rollback. Conferir depois de tomar essas travas.
    await conferirBarreira(tx, pid);
  });
}

async function fixarInventario(id: string, inventario: CapturaAberta["inventario"], pid: number) {
  await db.transaction(async (tx) => {
    await limitarControle(tx);
    const [atual] = await tx
      .select({ state: captures.state })
      .from(captures)
      .where(eq(captures.id, id))
      .for("update");
    if (atual?.state !== "preparing") throw new FalhaDaCaptura("CAPTURA_ENCERRADA");
    const [total] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(holds)
      .where(and(eq(holds.captureId, id), isNull(holds.releasedAt)));
    if (total?.n !== inventario.quantidade) throw new FalhaDaCaptura("INVENTARIO");
    await conferirBarreira(tx, pid);
    await tx
      .update(captures)
      .set({
        state: "captured",
        capturedAt: AGORA,
        inventorySha256: inventario.sha256,
        objectCount: inventario.quantidade,
        objectBytes: inventario.bytesCifrados,
      })
      .where(eq(captures.id, id));
    await logAuditEventStrict(
      "recreio.backup_inventory_fixed",
      null,
      { app: "recreio", captureId: id, objectCount: inventario.quantidade },
      { writer: tx },
    );
  });
}

/** Só composição operacional interna. Duas conexões próprias: transação de
 * coordenação EXCLUSIVA antes do snapshot e origem REPEATABLE READ/READ ONLY.
 * Conserva a barreira até terminar a leitura do snapshot; reservas duráveis
 * sobrevivem à falha/fechamento. Não envia arquivo, não libera reservas, não
 * habilita cron. Coleta futura deve tomar a MESMA trava compartilhada primeiro. */
export async function comCapturaConsistente<T>(
  destino: DestinoDeCaptura,
  executar: (captura: CapturaAberta) => Promise<T>,
): Promise<T> {
  const alvo = DestinoDeCapturaSchema.safeParse(destino),
    url = process.env.DATABASE_URL;
  if (!alvo.success || !url) throw new FalhaDaCaptura("CONFIGURACAO");
  const [captura] = await db.transaction(async (tx) => {
    await limitarControle(tx);
    const registros = await tx
      .insert(captures)
      .values({
        protocolVersion: 1,
        storageScope: alvo.data.escopo,
        bucketId: alvo.data.bucketId,
        bucketName: alvo.data.bucketName,
      })
      .returning({ id: captures.id });
    const r = registros[0];
    if (!r) throw new FalhaDaCaptura("INVENTARIO");
    await logAuditEventStrict(
      "recreio.backup_capture_prepared",
      null,
      { app: "recreio", captureId: r.id, storageScope: alvo.data.escopo },
      { writer: tx },
    );
    return registros;
  });
  if (!captura) throw new FalhaDaCaptura("INVENTARIO");
  const coordenador = postgres(url, {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      connection: { application_name: "recreio-backup-coordinator" },
    }),
    origem = postgres(url, {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      connection: { application_name: "recreio-backup-source" },
    });
  let resultado: { ok: true; valor: T } | { ok: false; erro: unknown };
  const interrupcao = new AbortController();
  const conferirInterrupcao = () => {
    if (interrupcao.signal.aborted) throw new FalhaDaCaptura("CAPTURA_ENCERRADA");
  };
  let tarefaDaOrigem: Promise<{ valor: T }> | undefined;
  try {
    const fora = await coordenador.begin(async (barreira) => {
      await barreira.unsafe("set local lock_timeout='15000ms'");
      await barreira.unsafe("set local transaction_timeout='0'");
      const [coordenacao] = await barreira<
        { pid: number }[]
      >`select pg_backend_pid() as pid, pg_advisory_xact_lock(${BARREIRA_CAPTURA_COLETA.grupo},${BARREIRA_CAPTURA_COLETA.chave})`;
      if (!coordenacao) throw new FalhaDaCaptura("CONFIGURACAO");
      tarefaDaOrigem = origem.begin("isolation level repeatable read read only", async (fonte) => {
        conferirInterrupcao();
        await fonte.unsafe("set local statement_timeout='15000ms'");
        await fonte.unsafe("set local lock_timeout='5000ms'");
        await fonte.unsafe("set local transaction_timeout='600000ms'");
        const [s] = await fonte<{ snapshot: string }[]>`select pg_export_snapshot() as snapshot`;
        if (!s || !/^[A-Fa-f0-9]+-[A-Fa-f0-9]+-[0-9]+$/.test(s.snapshot))
          throw new FalhaDaCaptura("INVENTARIO");
        const hash = createHash("sha256");
        let quantidade = 0,
          bytesCifrados = 0,
          lote: ObjetoDaCaptura[] = [];
        for await (const objeto of objetosNaVisao(fonte)) {
          conferirInterrupcao();
          quantidade++;
          bytesCifrados += objeto.referencia.bytesCifrados;
          if (quantidade > 1_000_000 || bytesCifrados > 68_719_476_736)
            throw new FalhaDaCaptura("LIMITE");
          hash.update(resumoDaReferencia(objeto), "ascii");
          lote.push(objeto);
          if (lote.length === 100) {
            await reservarLote(captura.id, lote, coordenacao.pid);
            lote = [];
          }
        }
        if (lote.length) await reservarLote(captura.id, lote, coordenacao.pid);
        conferirInterrupcao();
        const inventario = { quantidade, bytesCifrados, sha256: hash.digest("hex") };
        await fixarInventario(captura.id, inventario, coordenacao.pid);
        let ativa = true;
        try {
          return {
            valor: await executar({
              id: captura.id,
              snapshot: s.snapshot,
              signal: interrupcao.signal,
              origem: fonte,
              inventario,
              objetos: async function* () {
                if (!ativa) throw new FalhaDaCaptura("CAPTURA_ENCERRADA");
                conferirInterrupcao();
                for await (const objeto of objetosNaVisao(fonte)) {
                  if (!ativa) throw new FalhaDaCaptura("CAPTURA_ENCERRADA");
                  conferirInterrupcao();
                  yield objeto;
                }
              },
            }),
          };
        } finally {
          ativa = false;
          interrupcao.abort();
        }
      });
      const dentro = await tarefaDaOrigem;
      return { dentro };
    });
    resultado = { ok: true, valor: fora.dentro.valor };
  } catch (erro) {
    interrupcao.abort();
    resultado = { ok: false, erro };
    // begin da coordenação pode rejeitar antes de seu callback encerrar.
    // Aguardar a origem ANTES de disputar a linha de controle ou fechar pool.
    if (tarefaDaOrigem) {
      const [terminou] = await Promise.allSettled([tarefaDaOrigem]);
      if (terminou?.status === "rejected" && terminou.reason !== erro)
        resultado = {
          ok: false,
          erro: new AggregateError([erro, terminou.reason], "CAPTURA_INTERROMPIDA"),
        };
    }
    try {
      await db.transaction(async (tx) => {
        await limitarControle(tx);
        const mudadas = await tx
          .update(captures)
          .set({ state: "review", reviewReason: "source_lost" })
          .where(
            and(eq(captures.id, captura.id), inArray(captures.state, ["preparing", "captured"])),
          )
          .returning({ id: captures.id });
        if (mudadas.length)
          await logAuditEventStrict(
            "recreio.backup_capture_reviewed",
            null,
            { app: "recreio", captureId: captura.id, reasonCode: "source_lost" },
            { writer: tx },
          );
      });
    } catch (revisao) {
      resultado = {
        ok: false,
        erro: new AggregateError([resultado.erro, revisao], "CAPTURA_E_REVISAO_INCONCLUSIVAS"),
      };
    }
  }
  const fechamentos = await Promise.allSettled([
    coordenador.end({ timeout: 10 }),
    origem.end({ timeout: 10 }),
  ]);
  if (fechamentos.some((r) => r.status === "rejected")) {
    if (!resultado.ok)
      throw new AggregateError(
        [resultado.erro, new FalhaDaCaptura("LIMPEZA")],
        "CAPTURA_E_LIMPEZA_INCONCLUSIVAS",
      );
    throw new FalhaDaCaptura("LIMPEZA");
  }
  if (!resultado.ok) throw resultado.erro;
  return resultado.valor;
}
