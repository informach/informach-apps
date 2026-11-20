import "server-only";
import { asc, db, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioBackupObjectHolds as holds,
  recreioBackupPublications as publications,
  recreioBackupRetirements as retirements,
} from "@informach/db/schema";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { limitarControleDoBackup } from "./controle-repository";
import { FalhaDaPublicacao } from "./falha-controle";

/** Bounded read-only hints, never capabilities or absence proofs. The job
 * must own its genuine executor scope and each native writer must revalidate
 * the state under its existing locks. Neither object bytes nor index bodies
 * nor family/game identities are loaded by this scanner. */
export async function listarPendenciasDoBackup(config: {
  fotografias: DestinoDeCaptura;
  arquivos: DestinoDeCaptura;
}) {
  const fotos = DestinoDeCapturaSchema.safeParse(config.fotografias);
  const arquivos = DestinoDeCapturaSchema.safeParse(config.arquivos);
  if (!fotos.success || !arquivos.success || fotos.data.escopo !== arquivos.data.escopo)
    throw new FalhaDaPublicacao("CONFIGURACAO");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    await limitarControleDoBackup(tx);
    const origem = sql`${captures.protocolVersion}=1
      and ${captures.bucketId}=${fotos.data.bucketId}
      and ${captures.bucketName}=${fotos.data.bucketName}
      and ${captures.storageScope}=${fotos.data.escopo}`;
    const destino = sql`${publications.bucketId}=${arquivos.data.bucketId}
      and ${publications.bucketName}=${arquivos.data.bucketName}
      and ${publications.storageScope}=${arquivos.data.escopo}`;
    const reservas = sql`exists(select 1 from ${holds}
      where ${holds.captureId}=${captures.id} and ${holds.releasedAt} is null)`;
    const semPublicacao = sql`not exists(select 1 from ${publications}
      where ${publications.captureId}=${captures.id})`;
    const semRetirada = sql`not exists(select 1 from ${retirements}
      where ${retirements.captureId}=${captures.id})`;
    const semArquivo = await tx
      .select({ id: captures.id })
      .from(captures)
      .where(sql`${origem} and ${semPublicacao} and ${captures.sealedAt} is null
        and ${captures.verifiedAt} is null and ${captures.state} in ('preparing','captured','review')`)
      .orderBy(asc(captures.createdAt), asc(captures.id))
      .limit(20);
    const reservasAbandonadas = await tx
      .select({ id: captures.id })
      .from(captures)
      .where(sql`${origem} and ${semPublicacao} and ${reservas}
        and ${captures.state}='abandoned' and ${captures.sealedAt} is null and ${captures.verifiedAt} is null`)
      .orderBy(asc(captures.createdAt), asc(captures.id))
      .limit(20);
    const publicacoes = await tx
      .select({ id: captures.id })
      .from(captures)
      .innerJoin(publications, sql`${publications.captureId}=${captures.id}`)
      .where(sql`${origem} and ${destino} and ${semRetirada}
        and ${captures.state}='sealed' and ${publications.state}<>'published'
        and ${publications.leaseUntil}<=clock_timestamp()`)
      .orderBy(asc(publications.leaseUntil), asc(captures.id))
      .limit(20);
    const reservasPublicadas = await tx
      .select({ id: captures.id })
      .from(captures)
      .innerJoin(publications, sql`${publications.captureId}=${captures.id}`)
      .where(sql`${origem} and ${destino} and ${semRetirada} and ${reservas}
        and ${captures.state}='verified' and ${publications.state}='published'`)
      .orderBy(asc(publications.publishedAt), asc(captures.id))
      .limit(20);
    const reservasRetiradas = await tx
      .select({ id: captures.id })
      .from(captures)
      .innerJoin(publications, sql`${publications.captureId}=${captures.id}`)
      .innerJoin(retirements, sql`${retirements.captureId}=${captures.id}`)
      .where(sql`${origem} and ${destino} and ${reservas} and ${retirements.state}='absent'
        and ${retirements.firstAbsenceAt} is not null and ${retirements.markerStoredAt} is not null`)
      .orderBy(asc(retirements.firstAbsenceAt), asc(captures.id))
      .limit(20);
    return { semArquivo, reservasAbandonadas, publicacoes, reservasPublicadas, reservasRetiradas };
  });
}
