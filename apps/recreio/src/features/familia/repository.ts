import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, gt, isNull, lte, or, sql } from "@informach/db";
import {
  recreioAdultDeclarations as declarations,
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioMinorProfiles as minors,
  recreioProfiles as profiles,
  recreioProfileCreationRequests as requests,
} from "@informach/db/schema";
import {
  exigirNascimentoDeMenor,
  limiteDePerfisDoTier,
  VERSAO_DA_RESPONSABILIDADE,
} from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import { paraPerfil } from "@/features/perfis/repository";
import { assertAllowed } from "@/lib/errors";
import { type Transacao, travar } from "@/lib/repository";
import type { CadastroDeMenor } from "./regras";

export const VALIDADE_DA_INTENCAO_MS = 15 * 60_000;
export const RETENCAO_DO_RECIBO_MS = 24 * 60 * 60_000;
const LIMITE_DE_INTENCOES = 5;
async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}
const calendario = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "numeric",
});
function mesEAno(agora: Date) {
  const partes = calendario.formatToParts(agora);
  const ano = partes.find((parte) => parte.type === "year")?.value;
  const mes = partes.find((parte) => parte.type === "month")?.value;
  if (!ano || !mes) throw new Error("recreio.calendar.failed");
  return { ano: Number(ano), mes: Number(mes) };
}
async function limparRecibosDaConta(tx: Transacao, contaId: string, agora: Date) {
  await tx
    .delete(requests)
    .where(
      and(
        eq(requests.userId, contaId),
        or(
          and(isNull(requests.consumedAt), lte(requests.expiresAt, agora)),
          lte(requests.consumedAt, new Date(agora.getTime() - RETENCAO_DO_RECIBO_MS)),
        ),
      ),
    );
}

/** Não aceitar um UUID escolhido no cliente como autorização para iniciar cadastro. */
export async function prepararCadastroDeMenor(autor: AutorNativoRecente) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const contexto = await autorizarContaNativa(tx, autor);
    await travar(tx, `recreio:cadastro-perfil:conta:${autor.contaId}`);
    const agora = await contexto.conferirPrazo(autor.login);
    await limparRecibosDaConta(tx, autor.contaId, agora);
    const pendentes = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.userId, autor.contaId),
          isNull(requests.consumedAt),
          gt(requests.expiresAt, agora),
        ),
      )
      .limit(LIMITE_DE_INTENCOES);
    assertAllowed(
      pendentes.length < LIMITE_DE_INTENCOES,
      "CADASTRO_PENDENTE",
      "Você já abriu outros cadastros. Conclua um deles ou aguarde alguns minutos.",
    );
    const [criado] = await tx
      .insert(requests)
      .values({
        userId: autor.contaId,
        createdAt: agora,
        expiresAt: new Date(agora.getTime() + VALIDADE_DA_INTENCAO_MS),
      })
      .returning({ id: requests.id, expiresAt: requests.expiresAt });
    assertAllowed(criado, "CADASTRO", "Não foi possível preparar o cadastro.");
    return { id: criado.id, expiraEm: criado.expiresAt.toISOString() };
  });
}

export async function confirmarCadastroDeMenor(autor: AutorNativoRecente, pedido: CadastroDeMenor) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        apelido: pedido.perfil.apelido,
        avatar: pedido.perfil.avatar,
        ano: pedido.nascimento.ano,
        mes: pedido.nascimento.mes,
        versao: pedido.versaoDaDeclaracao,
      }),
    )
    .digest("hex");
  return db.transaction(async (tx) => {
    await limites(tx);
    const contexto = await autorizarContaNativa(tx, autor);
    await travar(tx, `recreio:cadastro-perfil:conta:${autor.contaId}`);
    const [intencao] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.id, pedido.intencaoId), eq(requests.userId, autor.contaId)))
      .for("update");
    assertAllowed(intencao, "CADASTRO", "Abra novamente o cadastro para continuar.");
    let agora = await contexto.conferirPrazo(autor.login);
    if (intencao.consumedAt) {
      assertAllowed(
        intencao.consumedAt.getTime() > agora.getTime() - RETENCAO_DO_RECIBO_MS &&
          intencao.fingerprint === fingerprint,
        "CONFLITO",
        "Este cadastro já foi concluído com outros dados ou venceu.",
      );
      assertAllowed(
        intencao.profileId,
        "CADASTRO_ENCERRADO",
        "Este perfil não está mais disponível.",
      );
      const [existente] = await tx
        .select({ perfil: profiles })
        .from(profiles)
        .innerJoin(guardians, eq(guardians.profileId, profiles.id))
        .where(
          and(eq(profiles.id, intencao.profileId), eq(guardians.guardianUserId, autor.contaId)),
        );
      assertAllowed(existente, "CADASTRO_ENCERRADO", "Este perfil não está mais disponível.");
      return { perfil: paraPerfil(existente.perfil), criado: false };
    }
    assertAllowed(
      intencao.expiresAt > agora,
      "CADASTRO_VENCIDO",
      "Este cadastro venceu. Abra um novo para continuar.",
    );
    await tx
      .insert(groups)
      .values({ ownerUserId: autor.contaId })
      .onConflictDoNothing({ target: groups.ownerUserId });
    const [grupo] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.ownerUserId, autor.contaId))
      .for("update");
    assertAllowed(grupo, "CADASTRO", "Não foi possível preparar o grupo.");
    const limite = limiteDePerfisDoTier("family");
    const cadastrados = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.groupId, grupo.id))
      .limit(limite);
    agora = await contexto.conferirPrazo(autor.login);
    assertAllowed(
      intencao.expiresAt > agora,
      "CADASTRO_VENCIDO",
      "Este cadastro venceu. Abra um novo para continuar.",
    );
    assertAllowed(
      cadastrados.length < limite,
      "LIMITE_DE_PERFIS",
      "Este grupo já tem quatro perfis.",
    );
    exigirNascimentoDeMenor(pedido.nascimento, mesEAno(agora));
    await tx
      .insert(declarations)
      .values({ userId: autor.contaId, version: VERSAO_DA_RESPONSABILIDADE, createdAt: agora })
      .onConflictDoNothing({ target: [declarations.userId, declarations.version] });
    const [declaracao] = await tx
      .select({ id: declarations.id })
      .from(declarations)
      .where(
        and(
          eq(declarations.userId, autor.contaId),
          eq(declarations.version, VERSAO_DA_RESPONSABILIDADE),
        ),
      );
    assertAllowed(declaracao, "CADASTRO", "Não foi possível registrar a responsabilidade.");
    const [perfil] = await tx
      .insert(profiles)
      .values({
        kind: "minor",
        groupId: grupo.id,
        nickname: pedido.perfil.apelido,
        avatar: pedido.perfil.avatar,
        createdAt: agora,
        updatedAt: agora,
      })
      .returning();
    assertAllowed(perfil, "CADASTRO", "Não foi possível criar o perfil.");
    await tx.insert(minors).values({
      profileId: perfil.id,
      birthYear: pedido.nascimento.ano,
      birthMonth: pedido.nascimento.mes,
      createdAt: agora,
    });
    const [vinculo] = await tx
      .insert(guardians)
      .values({
        profileId: perfil.id,
        guardianUserId: autor.contaId,
        declarationId: declaracao.id,
        createdAt: agora,
      })
      .returning({ id: guardians.id });
    assertAllowed(vinculo, "CADASTRO", "Não foi possível registrar o responsável.");
    await tx
      .update(requests)
      .set({ profileId: perfil.id, consumedAt: agora, fingerprint })
      .where(eq(requests.id, intencao.id));
    await logAuditEventStrict(
      "recreio.profile_created",
      autor.contaId,
      {
        app: "recreio",
        profileId: perfil.id,
        kind: "minor",
        guardianLinkId: vinculo.id,
        declarationVersion: VERSAO_DA_RESPONSABILIDADE,
      },
      { writer: tx },
    );
    return { perfil: paraPerfil(perfil), criado: true };
  });
}
