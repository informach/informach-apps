import type { FileHandle } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { criarCifradorDeObjetos } from "../../src/features/objetos/criptografia";
import type { criarArquivoComposto } from "./arquivo-composto";
import type { PublicacaoDoBackup } from "./indice-recuperacao";

type Conteudo = Awaited<ReturnType<ReturnType<typeof criarArquivoComposto>["abrir"]>>;
const MAX_FOTO = 4 * 1024 * 1024;
export class FalhaDaNormalizacao extends Error {
  constructor(
    readonly codigo:
      | "DESTINO_NAO_PRIVADO"
      | "PERFIL_NAO_SUPORTADO"
      | "INVENTARIO"
      | "VINCULO"
      | "INTEGRIDADE",
  ) {
    super(`recreio.backup_normalization.${codigo}`);
  }
}
function exigir(v: unknown, codigo: FalhaDaNormalizacao["codigo"]): asserts v {
  if (!v) throw new FalhaDaNormalizacao(codigo);
}
/** Capacidade offline do executor: nenhum TCP ou nome de banco livre. Não é
 * uma autorização de corte nem uma forma de operar o PostgreSQL original. */
export async function exigirBancoPrivadoDeRecuperacao(copia: postgres.Sql) {
  const [r] = await copia.unsafe<
    { banco: string; porta: string; socket: string; rede: string; versao: string; local: boolean }[]
  >(`
    select pg_catalog.current_database() as banco,pg_catalog.current_setting('port') as porta,
      pg_catalog.current_setting('unix_socket_directories') as socket,pg_catalog.current_setting('listen_addresses') as rede,
      pg_catalog.current_setting('server_version_num') as versao,pg_catalog.inet_server_addr() is null as local`);
  exigir(
    r &&
      /^recreio_restore_[a-f0-9]{24}$/.test(r.banco) &&
      r.porta === "55432" &&
      /^\/tmp\/recreio-backup-[A-Za-z0-9]+$/.test(r.socket) &&
      r.rede === "" &&
      r.local &&
      r.versao === "180006",
    "DESTINO_NAO_PRIVADO",
  );
}
/** Reidrata somente no cluster novo já comparado ao inventário autenticado.
 * Fonte é o arquivo composto; não há cliente S3 nem credencial da origem aqui.
 * Transação única: qualquer divergência reverte dados/ponteiros/quarentenas.
 * Perfil inicial: schema com quarentena e fotos de até 4 MiB. Formatos anteriores
 * precisam de seu reader/migração próprios; não são alterados por adivinhação. */
export async function normalizarFotografiasRestauradas(config: {
  copia: postgres.Sql;
  acesso: Conteudo;
  fotografia: FileHandle;
  inventario: PublicacaoDoBackup["inventario"];
}) {
  const { copia, acesso, fotografia } = config,
    esperado = { ...config.inventario };
  exigir(isDeepStrictEqual(esperado, acesso.resumo.inventario), "INVENTARIO");
  await exigirBancoPrivadoDeRecuperacao(copia);
  const [perfil] = await copia.unsafe<{ valido: boolean }[]>(`select
    exists(select 1 from information_schema.columns where table_schema='recreio' and table_name='snapshot_object_deliveries' and column_name='quarantined_state')
    and exists(select 1 from information_schema.columns where table_schema='recreio' and table_name='backup_captures' and column_name='protocol_version') as valido`);
  exigir(perfil?.valido, "PERFIL_NAO_SUPORTADO");
  return copia.begin("isolation level repeatable read read write", async (sql) => {
    await sql.unsafe("set local search_path=pg_catalog");
    await sql.unsafe("set local statement_timeout='5000ms'");
    await sql.unsafe("set local lock_timeout='5000ms'");
    await sql.unsafe("set local transaction_timeout='120000ms'");
    let fotos = 0,
      ligadas = 0;
    await acesso.comChaves(async (recuperadas, signal) => {
      const ativa = recuperadas.keys().next().value,
        abridor = ativa
          ? criarCifradorDeObjetos({
              chaveAtiva: ativa,
              chaves: recuperadas,
              limiteBytes: MAX_FOTO,
            })
          : undefined;
      for await (const item of acesso.objetos(signal)) {
        const o = item.objeto,
          r = o.referencia;
        exigir(
          r.bytes <= MAX_FOTO && r.bytesCifrados <= MAX_FOTO + 1024 && abridor,
          "PERFIL_NAO_SUPORTADO",
        );
        const [v] = await sql.unsafe<
          { identidade: boolean; origem: boolean; normalizada: boolean; data: Buffer | null }[]
        >(
          `
          select s.data,
            coalesce(s.space_id=$2 and s.sha256=$3 and s.byte_size=$4 and d.snapshot_reference=s.id and d.space_id=s.space_id
              and d.plaintext_sha256=s.sha256 and d.plaintext_bytes=s.byte_size and d.verified_at is not null
              and d.bucket_id=$6 and d.bucket_name=$7 and d.storage_scope=$8 and d.object_key=$9
              and d.cipher_sha256=$10 and d.cipher_bytes=$11 and d.encryption_key_id=$12,false) as identidade,
            coalesce(s.storage='bucket' and s.data is null and s.object_key=d.object_key and d.snapshot_id=s.id
              and d.state='verified' and d.quarantined_at is null,false) as origem,
            coalesce(s.storage='pg' and s.object_key is null and d.snapshot_id is null and d.state='quarantined'
              and d.quarantined_state='verified' and d.quarantined_at is not null,false) as normalizada
          from recreio.space_snapshots s left join recreio.snapshot_object_deliveries d on d.id=$5 where s.id=$1`,
          [
            o.fotografiaId,
            o.mundoId,
            r.sha256,
            r.bytes,
            o.entregaId,
            o.bucketId,
            o.bucketName,
            o.escopo,
            o.objectKey,
            r.sha256Cifrado,
            r.bytesCifrados,
            r.chaveId,
          ],
        );
        exigir(v?.identidade && (v.origem || v.normalizada), "VINCULO");
        ligadas++;
        await item.copiarPara(fotografia);
        const envelope = Buffer.alloc(r.bytesCifrados);
        let plain: Buffer | undefined;
        try {
          let pos = 0;
          while (pos < envelope.length) {
            const b = await fotografia.read(envelope, pos, envelope.length - pos, pos);
            exigir(b.bytesRead > 0, "INTEGRIDADE");
            pos += b.bytesRead;
          }
          plain = abridor.abrir(r, envelope);
          if (v.normalizada) exigir(Buffer.isBuffer(v.data) && v.data.equals(plain), "INTEGRIDADE");
          else {
            // Recibo fica histórico/quarentenado; nenhum expurgo alcança a origem.
            const destacada = await sql.unsafe(
              `update recreio.snapshot_object_deliveries set
              quarantined_at=clock_timestamp(),quarantined_state=state,state='quarantined',
              snapshot_id=null,detached_at=coalesce(detached_at,clock_timestamp()),envelope=null,lease_token=null,lease_until=null
              where id=$1 and state='verified' and snapshot_id=$2 returning id`,
              [o.entregaId, o.fotografiaId],
            );
            exigir(destacada.length === 1, "VINCULO");
            const gravada = await sql.unsafe(
              `update recreio.space_snapshots set storage='pg',data=$1,object_key=null
              where id=$2 and storage='bucket' and sha256=$3 and byte_size=$4 returning id`,
              [plain, o.fotografiaId, r.sha256, r.bytes],
            );
            exigir(gravada.length === 1, "VINCULO");
            const [lida] = await sql.unsafe<{ data: Buffer }[]>(
              `select data from recreio.space_snapshots where id=$1 and storage='pg' and object_key is null`,
              [o.fotografiaId],
            );
            exigir(lida && Buffer.isBuffer(lida.data) && lida.data.equals(plain), "INTEGRIDADE");
            lida.data.fill(0);
          }
          fotos++;
        } finally {
          plain?.fill(0);
          envelope.fill(0);
          v.data?.fill(0);
          await fotografia.truncate(0);
          await fotografia.sync();
        }
      }
    });
    exigir(fotos === esperado.quantidade && ligadas === fotos, "INVENTARIO");
    // Inclusive filas retiradas/preparadas que não integram as fotos bucket.
    await sql.unsafe(`update recreio.snapshot_object_deliveries set
      quarantined_at=clock_timestamp(),quarantined_state=state,state='quarantined',
      snapshot_id=null,detached_at=coalesce(detached_at,clock_timestamp()),envelope=null,lease_token=null,lease_until=null
      where state<>'quarantined'`);
    await sql.unsafe(
      `update recreio.backup_captures set protocol_version=0 where protocol_version<>0`,
    );
    const [fim] = await sql.unsafe<
      {
        bucket: number;
        recibos: number;
        pendentes: number;
        controles: number;
        controlesAtivos: number;
      }[]
    >(`select
      (select count(*)::int from recreio.space_snapshots where storage='bucket') as bucket,
      (select count(*)::int from recreio.snapshot_object_deliveries where state='quarantined') as recibos,
      (select count(*)::int from recreio.snapshot_object_deliveries where state<>'quarantined' or snapshot_id is not null or envelope is not null or lease_token is not null or lease_until is not null) as pendentes,
      (select count(*)::int from recreio.backup_captures) as controles,
      (select count(*)::int from recreio.backup_captures where protocol_version<>0) as "controlesAtivos"`);
    exigir(
      fim &&
        fim.bucket === 0 &&
        fim.pendentes === 0 &&
        fim.controlesAtivos === 0 &&
        fim.recibos >= fotos,
      "INTEGRIDADE",
    );
    return {
      fotosAutenticadas: fotos,
      vinculosConferidos: ligadas,
      fotosEmPg: fotos,
      recibosQuarentenados: fim.recibos,
      controlesQuarentenados: fim.controles,
      referenciasBucketRestantes: fim.bucket,
      operacoesDeOrigemRestantes: fim.pendentes,
    };
  });
}
