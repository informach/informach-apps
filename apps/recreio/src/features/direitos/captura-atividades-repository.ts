import "server-only";
import { and, eq, gt, sql } from "@informach/db";
import {
  recreioPairedCredentials as credentials,
  recreioDeviceSessions as devices,
  recreioSocialNotices as notices,
  recreioPairingRequests as pairing,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";

/** Receipts authored/received by this native account. This is not current
 * guardianship and never reads the child's name, content or present policy.
 * The authorized consistent transaction belongs to the personal capturer. */
export async function copiarAtividadesPessoaisNaTransacao(
  tx: Transacao,
  contaId: string,
  arquivo: ReturnType<typeof criarArquivoPessoal>,
  conferirPrazo: () => Promise<Date>,
) {
  async function paginas<T extends { cursor: string }>(
    tipo: string,
    buscar: (apos: string | null) => Promise<T[]>,
  ) {
    let apos: string | null = null;
    while (true) {
      const linhas = await buscar(apos);
      for (const { cursor, ...dados } of linhas) {
        assertAllowed(
          apos === null || cursor > apos,
          "INTEGRIDADE",
          "Não foi possível preparar a cópia.",
        );
        arquivo.adicionar(tipo, dados);
        apos = cursor;
      }
      await conferirPrazo();
      if (linhas.length < limites.pagina) return;
    }
  }
  await paginas("aparelho_pareado", (apos) =>
    tx
      .select({
        cursor: devices.id,
        perfilReferencia: credentials.profileId,
        tipo: devices.kind,
        criadoEm: devices.createdAt,
        vistoEm: devices.lastSeenAt,
        expiraEm: devices.expiresAt,
        revogadoEm: devices.revokedAt,
        pareamentoPedidoEm: pairing.createdAt,
        pareamentoAprovadoEm: pairing.approvedAt,
        pareamentoReivindicadoEm: pairing.claimedAt,
        pedidoExpiraEm: pairing.expiresAt,
        vinculoConfere: sql<boolean>`${pairing.id} is null or ${pairing.profileId}=${credentials.profileId}`,
      })
      .from(credentials)
      .innerJoin(devices, eq(devices.id, credentials.deviceSessionId))
      .leftJoin(pairing, eq(pairing.deviceSessionId, credentials.deviceSessionId))
      .where(
        and(
          eq(credentials.guardianUserId, contaId),
          eq(devices.kind, "paired_device"),
          apos ? gt(devices.id, apos) : undefined,
        ),
      )
      .orderBy(devices.id)
      .limit(limites.pagina)
      .then((linhas) =>
        linhas.map(({ vinculoConfere, ...dados }) => {
          assertAllowed(vinculoConfere, "INTEGRIDADE", "Não foi possível preparar a cópia.");
          return dados;
        }),
      ),
  );
  await paginas("aviso_social", (apos) =>
    tx
      .select({
        cursor: notices.id,
        perfilReferencia: notices.profileId,
        pedidoReferencia: notices.requestId,
        recebidoEm: notices.createdAt,
        lidoEm: notices.readAt,
      })
      .from(notices)
      .where(and(eq(notices.guardianUserId, contaId), apos ? gt(notices.id, apos) : undefined))
      .orderBy(notices.id)
      .limit(limites.pagina),
  );
}
