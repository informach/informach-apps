/**
 * Concessões do direito de jogar (cortesia da equipe), usadas pelos scripts
 * `conceder` e `revogar`. A cobrança ainda não existe nesta etapa: quem joga é
 * quem a equipe liberou, e cada liberação fica na auditoria.
 *
 * A linha da concessão e o evento de auditoria entram na mesma transação: ou
 * os dois ficam gravados, ou nenhum. O evento leva só ids, plano, dias e o
 * código do motivo; nunca o e-mail (ver docs/audit-payload-policy.md).
 *
 * Usa a mesma decisão de `src/features/acesso` ao retirar cobertura e encerrar
 * partidas. Roda por `tsx`, com a condição `react-server`, sem iniciar o Next.
 */
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, db, eq, gt, isNull, sql } from "@informach/db";
import {
  recreioEntitlements as entitlements,
  recreioGameSessions as gameSessions,
  recreioGroups as groups,
  recreioProfiles as profiles,
  users,
} from "@informach/db/schema";
import { PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";
import { decidirFatosLidos } from "../src/features/acesso/decisao";
import { lerFatosDeAcesso } from "../src/features/acesso/repository";
import { invalidarIngressosDoPerfil } from "../src/features/sessao-de-jogo/ingressos-repository";
import { encerrarSessoesAbertas } from "../src/features/sessao-de-jogo/repository";

/** Código curto, sem texto livre: é ele que vai para a auditoria. */
const Motivo = z.string().regex(/^[a-z0-9_]{2,40}$/);
const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const PedidoDeConcessaoSchema = z.strictObject({
  email: Email,
  tier: z.enum(["individual", "family"]),
  dias: z.number().int().min(1).max(366),
  motivo: Motivo,
});
export type PedidoDeConcessao = z.infer<typeof PedidoDeConcessaoSchema>;

export const PedidoDeRevogacaoSchema = z.strictObject({ email: Email, motivo: Motivo });
export type PedidoDeRevogacao = z.infer<typeof PedidoDeRevogacaoSchema>;

export type CodigoDeRecusa =
  | "CONTA_NAO_ENCONTRADA"
  | "EMAIL_NAO_CONFIRMADO"
  | "CONCESSAO_VIGENTE"
  | "SEM_CONCESSAO_VIGENTE";

const MENSAGENS: Record<CodigoDeRecusa, string> = {
  CONTA_NAO_ENCONTRADA:
    "Nenhuma conta com esse e-mail. A pessoa precisa criar a conta no Recreio antes.",
  EMAIL_NAO_CONFIRMADO:
    "O e-mail desta conta ainda não foi confirmado. A pessoa confirma com o código e o script roda de novo.",
  CONCESSAO_VIGENTE:
    "Este grupo já tem uma concessão vigente. Revogue a atual antes de conceder outra.",
  SEM_CONCESSAO_VIGENTE: "Este grupo não tem concessão vigente para revogar.",
};

export class RecusaDeConcessao extends Error {
  readonly codigo: CodigoDeRecusa;
  constructor(codigo: CodigoDeRecusa) {
    super(MENSAGENS[codigo]);
    this.name = "RecusaDeConcessao";
    this.codigo = codigo;
  }
}

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Acha a conta e a trava até o fim da transação. Duas concessões para a mesma
 * conta, ou uma concessão e a criação do perfil, passam uma de cada vez.
 */
async function contaConfirmada(tx: Transacao, email: string) {
  const [conta] = await tx
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email))
    .for("no key update");
  if (!conta) throw new RecusaDeConcessao("CONTA_NAO_ENCONTRADA");
  if (!conta.emailVerified) throw new RecusaDeConcessao("EMAIL_NAO_CONFIRMADO");
  return conta;
}

/** Vigente: não revogada e ainda não vencida. */
function vigentes(tx: Transacao, grupoId: string, agora: Date) {
  return tx
    .select({ id: entitlements.id, endsAt: entitlements.endsAt })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.groupId, grupoId),
        isNull(entitlements.revokedAt),
        gt(entitlements.endsAt, agora),
      ),
    );
}

export type ConcessaoFeita = {
  concessaoId: string;
  grupoId: string;
  contaId: string;
  inicio: Date;
  fim: Date;
};

/**
 * Concede uma cortesia que começa agora. Exige conta com e-mail confirmado,
 * cria o grupo dela se ainda não existir e recusa se já houver concessão
 * vigente para o grupo. O pedido é conferido aqui, venha de onde vier.
 */
export async function conceder(
  pedido: unknown,
  opcoes: { agora?: Date } = {},
): Promise<ConcessaoFeita> {
  const dados = PedidoDeConcessaoSchema.parse(pedido);
  const inicio = opcoes.agora ?? new Date();
  const fim = new Date(inicio.getTime() + dados.dias * 86_400_000);
  return db.transaction(async (tx) => {
    const conta = await contaConfirmada(tx, dados.email);
    await tx
      .insert(groups)
      .values({ ownerUserId: conta.id })
      .onConflictDoNothing({ target: groups.ownerUserId });
    const [grupo] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.ownerUserId, conta.id));
    if (!grupo) throw new Error("Grupo não encontrado depois de criado.");
    if ((await vigentes(tx, grupo.id, inicio)).length > 0)
      throw new RecusaDeConcessao("CONCESSAO_VIGENTE");
    const [concessao] = await tx
      .insert(entitlements)
      .values({
        groupId: grupo.id,
        kind: "courtesy",
        tier: dados.tier,
        startsAt: inicio,
        endsAt: fim,
        reasonCode: dados.motivo,
      })
      .returning({ id: entitlements.id });
    if (!concessao) throw new Error("A concessão não foi gravada.");
    await logAuditEventStrict(
      "recreio.entitlement_granted",
      null,
      {
        app: "recreio",
        entitlementId: concessao.id,
        groupId: grupo.id,
        targetId: conta.id,
        tier: dados.tier,
        days: dados.dias,
        reasonCode: dados.motivo,
      },
      { writer: tx },
    );
    return { concessaoId: concessao.id, grupoId: grupo.id, contaId: conta.id, inicio, fim };
  });
}

export type RevogacaoFeita = {
  concessaoIds: string[];
  grupoId: string;
  contaId: string;
  revogadaEm: Date;
};

/** Revoga a concessão vigente do grupo da conta. O acesso para na hora. */
export async function revogar(
  pedido: unknown,
  opcoes: { agora?: Date } = {},
): Promise<RevogacaoFeita> {
  const dados = PedidoDeRevogacaoSchema.parse(pedido);
  return db.transaction(async (tx) => {
    const conta = await contaConfirmada(tx, dados.email);
    const [grupo] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.ownerUserId, conta.id));
    // A abertura toma SHARE no perfil antes de reler o acesso: uma sessão
    // admitida antes desta trava será alcançada pelo encerramento abaixo.
    const perfis = grupo
      ? await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.groupId, grupo.id))
          .orderBy(asc(profiles.id))
          .for("update")
      : [];
    const revogadaEm = opcoes.agora ?? new Date();
    const abertas = grupo ? await vigentes(tx, grupo.id, revogadaEm) : [];
    if (!grupo || abertas.length === 0) throw new RecusaDeConcessao("SEM_CONCESSAO_VIGENTE");
    for (const concessao of abertas) {
      await tx
        .update(entitlements)
        .set({ revokedAt: revogadaEm, revokeReasonCode: dados.motivo })
        .where(and(eq(entitlements.id, concessao.id), isNull(entitlements.revokedAt)));
      await logAuditEventStrict(
        "recreio.entitlement_revoked",
        null,
        {
          app: "recreio",
          entitlementId: concessao.id,
          groupId: grupo.id,
          targetId: conta.id,
          reasonCode: dados.motivo,
        },
        { writer: tx },
      );
    }
    for (const perfil of perfis) {
      const perfilId = PerfilIdSchema.parse(perfil.id);
      const decisao = decidirFatosLidos(await lerFatosDeAcesso(perfilId, tx), revogadaEm);
      // Uma cortesia retirada não interrompe outra cobertura ainda válida.
      if (!decisao.podeJogar) {
        await invalidarIngressosDoPerfil(tx, perfilId);
        await encerrarSessoesAbertas(
          tx,
          sql`${gameSessions.profileId} = ${perfilId}`,
          "access_lost",
          { porQuem: "recreio" },
        );
      }
    }
    return {
      concessaoIds: abertas.map((concessao) => concessao.id),
      grupoId: grupo.id,
      contaId: conta.id,
      revogadaEm,
    };
  });
}
