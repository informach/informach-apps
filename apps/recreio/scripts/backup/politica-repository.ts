import "server-only";
import { asc, db, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioBackupPublications as publications,
  recreioBackupRetirements as retirements,
} from "@informach/db/schema";
import { z } from "zod";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { limitarControleDoBackup } from "./controle-repository";
import { FalhaDaPublicacao } from "./falha-controle";

const Parametros = z.strictObject({
  intervaloSegundos: z.number().int().min(60).max(86400),
  retencaoDias: z.number().int().min(1).max(88),
});
export function conferirParametrosDaPolitica(input: unknown) {
  const parsed = Parametros.safeParse(input);
  if (!parsed.success) throw new FalhaDaPublicacao("CONFIGURACAO");
  return parsed.data;
}

/** Read-only bounded policy hints using PostgreSQL's clock. Cadence follows
 * the original capture time, never a late publication/retry time. Neither a
 * missing record nor this scan is authorization to delete an archive. */
export async function avaliarPoliticaDoBackup(config: {
  fotografias: DestinoDeCaptura;
  arquivos: DestinoDeCaptura;
  intervaloSegundos: number;
  retencaoDias: number;
}) {
  const fotos = DestinoDeCapturaSchema.safeParse(config.fotografias),
    arquivos = DestinoDeCapturaSchema.safeParse(config.arquivos);
  conferirParametrosDaPolitica({
    intervaloSegundos: config.intervaloSegundos,
    retencaoDias: config.retencaoDias,
  });
  if (!fotos.success || !arquivos.success || fotos.data.escopo !== arquivos.data.escopo)
    throw new FalhaDaPublicacao("CONFIGURACAO");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    await limitarControleDoBackup(tx);
    const elegivel = sql`${captures.protocolVersion}=1 and ${captures.state}='verified'
      and ${captures.bucketId}=${fotos.data.bucketId} and ${captures.bucketName}=${fotos.data.bucketName}
      and ${captures.storageScope}=${fotos.data.escopo} and ${publications.state}='published'
      and ${publications.bucketId}=${arquivos.data.bucketId} and ${publications.bucketName}=${arquivos.data.bucketName}
      and ${publications.storageScope}=${arquivos.data.escopo}
      and not exists(select 1 from ${retirements} where ${retirements.captureId}=${captures.id})`;
    const [cadencia] = await tx
      .select({
        necessaria: sql<boolean>`coalesce(max(${captures.capturedAt})<=clock_timestamp()-(${config.intervaloSegundos}::integer*interval '1 second'),true)`,
        idadeSegundos: sql<
          number | null
        >`extract(epoch from clock_timestamp()-max(${captures.capturedAt}))::double precision`,
      })
      .from(captures)
      .innerJoin(publications, sql`${publications.captureId}=${captures.id}`)
      .where(elegivel);
    if (
      !cadencia ||
      typeof cadencia.necessaria !== "boolean" ||
      (cadencia.idadeSegundos !== null &&
        (!Number.isFinite(cadencia.idadeSegundos) || cadencia.idadeSegundos < 0))
    )
      throw new FalhaDaPublicacao("INTEGRIDADE");
    const retencoes = await tx
      .select({ id: captures.id })
      .from(captures)
      .innerJoin(publications, sql`${publications.captureId}=${captures.id}`)
      .where(
        sql`${elegivel} and ${captures.capturedAt}<=clock_timestamp()-(${config.retencaoDias * 86400}::integer*interval '1 second')`,
      )
      .orderBy(asc(captures.capturedAt), asc(captures.id))
      .limit(20);
    return {
      capturaNecessaria: cadencia.necessaria,
      idadeDaUltimaCapturaSegundos: cadencia.idadeSegundos,
      retencoes,
    };
  });
}
