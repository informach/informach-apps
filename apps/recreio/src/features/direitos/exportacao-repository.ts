import "server-only";
import { isDeepStrictEqual } from "node:util";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioPersonalExports as exports,
  recreioGuardianLinks as guardians,
} from "@informach/db/schema";
import { PerfilIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import {
  conferirReferenciaDoObjeto,
  type ReferenciaDoObjeto,
} from "@/features/objetos/criptografia";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { comPerfilPessoal, conferirAutorDeDireitosNoBanco } from "./autoridade-repository";
import type { capturarDadosPessoaisDoPerfil } from "./captura-perfil-repository";

type Captura = Awaited<ReturnType<typeof capturarDadosPessoaisDoPerfil>>;
type Linha = typeof exports.$inferSelect;
const colunas = {
  id: exports.id,
  requesterUserId: exports.requesterUserId,
  profileId: exports.profileId,
  deviceSessionId: exports.deviceSessionId,
  authSessionId: exports.authSessionId,
  profileKind: exports.profileKind,
  policyVersion: exports.policyVersion,
  guardianReference: exports.guardianReference,
  state: exports.state,
  capturedAt: exports.capturedAt,
  expiresAt: exports.expiresAt,
  createdAt: exports.createdAt,
};
function indisponivel(valor: unknown): asserts valor {
  assertAllowed(
    valor,
    "COPIA_INDISPONIVEL",
    "A cópia não está disponível. Prepare uma nova cópia com seu próprio login.",
  );
}
function recibo(linha: Pick<Linha, "id" | "expiresAt" | "capturedAt">, ref: ReferenciaDoObjeto) {
  return {
    copiaId: linha.id,
    capturadaEm: linha.capturedAt.toISOString(),
    expiraEm: linha.expiresAt.toISOString(),
    bytes: ref.bytes,
    sha256: ref.sha256,
  };
}
async function atual(
  tx: Transacao,
  autor: AutorNativoRecente,
  perfil: { id: string; kind: string; policyVersion: number; rightsOperationId: string | null },
  linha: Pick<
    Linha,
    | "requesterUserId"
    | "profileId"
    | "deviceSessionId"
    | "authSessionId"
    | "policyVersion"
    | "profileKind"
    | "guardianReference"
    | "state"
    | "expiresAt"
  >,
  agora: Date,
) {
  indisponivel(
    linha.requesterUserId === autor.contaId &&
      linha.profileId === perfil.id &&
      linha.deviceSessionId === autor.sessaoDeAparelhoId &&
      linha.authSessionId === autor.login.authSessionId &&
      linha.policyVersion === perfil.policyVersion &&
      linha.profileKind === perfil.kind &&
      perfil.rightsOperationId === null &&
      linha.state === "ready" &&
      linha.expiresAt > agora,
  );
  const [vinculo] = await tx
    .select({ id: guardians.id })
    .from(guardians)
    .where(and(eq(guardians.profileId, perfil.id), eq(guardians.guardianUserId, autor.contaId)));
  indisponivel((vinculo?.id ?? null) === linha.guardianReference);
}

/** Sem bytes antes da autorização nativa; pistas são só metadados próprios. */
export async function consultarCopiaPessoalNoBanco(
  autor: AutorNativoRecente,
  copiaId: string,
  perfilEsperado?: string,
) {
  await conferirAutorDeDireitosNoBanco(autor);
  const [pista] = await db
    .select({ perfilId: exports.profileId })
    .from(exports)
    .where(and(eq(exports.id, copiaId), eq(exports.requesterUserId, autor.contaId)));
  if (!pista) return null;
  indisponivel(perfilEsperado === undefined || perfilEsperado === pista.perfilId);
  return comPerfilPessoal(
    autor,
    PerfilIdSchema.parse(pista.perfilId),
    null,
    async (tx, perfil, prazo) => {
      const [linha] = await tx
        .select({ ...colunas, reference: exports.reference })
        .from(exports)
        .where(and(eq(exports.id, copiaId), eq(exports.requesterUserId, autor.contaId)))
        .for("share");
      indisponivel(linha);
      await atual(tx, autor, perfil, linha, await prazo());
      const ref = conferirReferenciaDoObjeto(linha.reference);
      indisponivel(ref.contexto.tipo === "exportacao" && ref.contexto.id === linha.id);
      return recibo(linha, ref);
    },
  );
}

/** Cifragem ocorre fora desta transação. Revalida o escopo capturado antes de
 * armazenar os bytes; concorrência usa o mutex nativo da conta e a UNIQUE. */
export function publicarCopiaPessoalNoBanco(
  autor: AutorNativoRecente,
  copiaId: string,
  captura: Omit<Captura, "bytes">,
  cifrada: { referencia: ReferenciaDoObjeto; bytes: Buffer },
) {
  const ref = conferirReferenciaDoObjeto(cifrada.referencia);
  indisponivel(
    ref.contexto.tipo === "exportacao" &&
      ref.contexto.id === copiaId &&
      ref.bytesCifrados === cifrada.bytes.length &&
      ref.bytes <= 32 * 1024 * 1024,
  );
  return comPerfilPessoal(autor, captura.perfilId, null, async (tx, perfil, prazo) => {
    const agora = await prazo(),
      capturadaEm = new Date(captura.capturadaEm),
      expiraEm = new Date(capturadaEm.getTime() + 10 * 60_000);
    indisponivel(
      Number.isFinite(capturadaEm.getTime()) && capturadaEm <= agora && expiraEm > agora,
    );
    await atual(
      tx,
      autor,
      perfil,
      {
        requesterUserId: autor.contaId,
        profileId: captura.perfilId,
        deviceSessionId: autor.sessaoDeAparelhoId,
        authSessionId: autor.login.authSessionId,
        policyVersion: captura.versaoDaPolitica,
        profileKind: captura.tipo,
        guardianReference: captura.responsabilidadeId,
        state: "ready",
        expiresAt: expiraEm,
      },
      agora,
    );
    const [anterior] = await tx
      .select(colunas)
      .from(exports)
      .where(eq(exports.id, copiaId))
      .for("update");
    // Repetição não substitui um arquivo nem revive um pedido vencido/revogado.
    if (anterior) {
      await atual(tx, autor, perfil, anterior, await prazo());
      const [completa] = await tx
        .select({ reference: exports.reference })
        .from(exports)
        .where(eq(exports.id, copiaId));
      return recibo(anterior, conferirReferenciaDoObjeto(completa?.reference));
    }
    // Uma única cópia pronta por conta. A substituição revoga os bytes anteriores
    // atomicamente, inclusive quando outra aba escolheu um novo identificador.
    await tx
      .update(exports)
      .set({ state: "revoked", reference: null, encryptedBytes: null, clearedAt: agora })
      .where(and(eq(exports.requesterUserId, autor.contaId), eq(exports.state, "ready")));
    await tx.insert(exports).values({
      id: copiaId,
      requesterUserId: autor.contaId,
      profileId: perfil.id,
      deviceSessionId: autor.sessaoDeAparelhoId,
      authSessionId: autor.login.authSessionId,
      profileKind: captura.tipo,
      policyVersion: captura.versaoDaPolitica,
      guardianReference: captura.responsabilidadeId,
      state: "ready",
      reference: ref,
      encryptedBytes: cifrada.bytes,
      capturedAt: capturadaEm,
      expiresAt: expiraEm,
      createdAt: agora,
    });
    await logAuditEventStrict(
      "recreio.personal_export_published",
      autor.contaId,
      { app: "recreio", exportId: copiaId },
      { writer: tx },
    );
    await prazo();
    return recibo({ id: copiaId, capturedAt: capturadaEm, expiresAt: expiraEm }, ref);
  });
}

/** Duas autorizações: antes de carregar o envelope e depois de abri-lo.
 * Retirar/trocar responsabilidade, política, contexto ou login durante o
 * processamento impede a admissão da resposta. UUID não é autorização. */
export async function carregarCopiaPessoalNoBanco(autor: AutorNativoRecente, copiaId: string) {
  const reciboAtual = await consultarCopiaPessoalNoBanco(autor, copiaId);
  indisponivel(reciboAtual);
  const [pista] = await db
    .select({ perfilId: exports.profileId })
    .from(exports)
    .where(and(eq(exports.id, copiaId), eq(exports.requesterUserId, autor.contaId)));
  indisponivel(pista);
  return comPerfilPessoal(
    autor,
    PerfilIdSchema.parse(pista.perfilId),
    null,
    async (tx, perfil, prazo) => {
      const [linha] = await tx
        .select({
          ...colunas,
          reference: exports.reference,
          encryptedBytes: exports.encryptedBytes,
        })
        .from(exports)
        .where(and(eq(exports.id, copiaId), eq(exports.requesterUserId, autor.contaId)))
        .for("share");
      indisponivel(linha);
      await atual(tx, autor, perfil, linha, await prazo());
      indisponivel(linha.encryptedBytes);
      return {
        perfilId: PerfilIdSchema.parse(perfil.id),
        referencia: conferirReferenciaDoObjeto(linha.reference),
        bytes: linha.encryptedBytes,
      };
    },
  );
}

export async function admitirDownloadPessoalNoBanco(
  autor: AutorNativoRecente,
  copiaId: string,
  referencia: ReferenciaDoObjeto,
) {
  const reciboAtual = await consultarCopiaPessoalNoBanco(autor, copiaId);
  indisponivel(
    reciboAtual &&
      reciboAtual.sha256 === referencia.sha256 &&
      reciboAtual.bytes === referencia.bytes &&
      referencia.contexto.tipo === "exportacao" &&
      referencia.contexto.id === copiaId,
  );
  // O evento representa admissão pelo servidor, não prova de que o navegador
  // terminou de receber o arquivo. Revalidar na mesma transação da auditoria.
  const [pista] = await db
    .select({ perfilId: exports.profileId })
    .from(exports)
    .where(and(eq(exports.id, copiaId), eq(exports.requesterUserId, autor.contaId)));
  indisponivel(pista);
  return comPerfilPessoal(
    autor,
    PerfilIdSchema.parse(pista.perfilId),
    null,
    async (tx, perfil, prazo) => {
      const [linha] = await tx
        .select({ ...colunas, reference: exports.reference })
        .from(exports)
        .where(and(eq(exports.id, copiaId), eq(exports.requesterUserId, autor.contaId)))
        .for("share");
      indisponivel(linha);
      await atual(tx, autor, perfil, linha, await prazo());
      indisponivel(isDeepStrictEqual(conferirReferenciaDoObjeto(linha.reference), referencia));
      await logAuditEventStrict(
        "recreio.personal_export_download_admitted",
        autor.contaId,
        { app: "recreio", exportId: copiaId },
        { writer: tx },
      );
      await prazo();
    },
  );
}

export async function revogarCopiaPessoalNoBanco(autor: AutorNativoRecente, copiaId: string) {
  // Revogar a própria cópia não depende de conservar responsabilidade pelo perfil.
  await conferirAutorDeDireitosNoBanco(autor);
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    // O helper abaixo toma a conta/perfil/aparelho na ordem canônica.
    const nativa = await autorizarContaNativa(tx, autor);
    const agora = await nativa.conferirPrazo(autor.login);
    const [linha] = await tx
      .select(colunas)
      .from(exports)
      .where(and(eq(exports.id, copiaId), eq(exports.requesterUserId, autor.contaId)))
      .for("update");
    if (linha?.state !== "ready") return { revogada: true as const };
    await tx
      .update(exports)
      .set({ state: "revoked", reference: null, encryptedBytes: null, clearedAt: agora })
      .where(eq(exports.id, copiaId));
    await logAuditEventStrict(
      "recreio.personal_export_revoked",
      autor.contaId,
      { app: "recreio", exportId: copiaId },
      { writer: tx },
    );
    await nativa.conferirPrazo(autor.login);
    return { revogada: true as const };
  });
}

/** Expiração retira o corpo numa escrita delimitada; recibos sem conteúdo
 * permanecem só 24 h. Não usa mutex de conta/perfil/aparelho, nem entrega bytes. */
export function expurgarCopiasPessoaisVencidas() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const expiradas = await tx.execute<{ id: string }>(sql`
      with lote as (select id from ${exports} where state='ready' and expires_at<=${AGORA} order by expires_at,id limit 100 for update skip locked)
      update ${exports} set state='expired', reference=null, encrypted_bytes=null, cleared_at=${AGORA} where id in (select id from lote) returning id
    `);
    const removidas = await tx.execute<{ id: string }>(sql`
      with lote as (select id from ${exports} where state<>'ready' and cleared_at<=${AGORA}-interval '24 hours' order by cleared_at,id limit 100 for update skip locked)
      delete from ${exports} where id in (select id from lote) returning id
    `);
    return { expiradas: expiradas.length, removidas: removidas.length };
  });
}
