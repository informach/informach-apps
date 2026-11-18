import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioTrialClaims as claims,
  customers,
  recreioEntitlements as grants,
  recreioGroups as groups,
  sessions,
  subscriptions,
} from "@informach/db/schema";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { criarPerfilProprio, selecionarPerfil } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { VERSAO_DO_TESTE } from "@/features/teste/constantes";
import { autorizarExperimento } from "@/features/teste/service";
import { type Jogador, loginReal, novaConta } from "./apoio";

export async function adultoDoTeste(comJogador = false) {
  const conta = await novaConta(),
    login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Contexto nativo ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  let jogador: Jogador | null = null;
  if (comJogador) {
    const { perfil } = await criarPerfilProprio(autor, {
      apelido: "Adulto do teste",
      avatar: "sol",
    });
    await selecionarPerfil(autor, perfil.id);
    jogador = { conta, login, perfil, ator: { ...contexto.ator, perfil } };
  }
  return { conta, autor, jogador };
}

export function pedidoDeTeste() {
  return {
    pedidoId: randomUUID(),
    souAdulto: true,
    aceitoExperimento: true,
    versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
    versaoDoTeste: VERSAO_DO_TESTE,
  };
}

/** Só prepara a concessão/recibo para testar retirada; não é prova de início por SID. */
export async function trialDeFixture(p: Awaited<ReturnType<typeof adultoDoTeste>>) {
  const consentimento = await autorizarExperimento(p.autor, pedidoDeTeste());
  const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id));
  if (!grupo) throw new Error("Grupo ausente");
  const startsAt = new Date(),
    endsAt = new Date(startsAt.getTime() + 48 * 60 * 60 * 1000);
  const [grant] = await db
    .insert(grants)
    .values({
      groupId: grupo.id,
      kind: "trial",
      tier: "family",
      startsAt,
      endsAt,
      reasonCode: "fixture_teste",
    })
    .returning();
  if (!grant) throw new Error("Concessão ausente");
  await db.insert(claims).values({
    payerUserId: p.conta.id,
    groupId: grupo.id,
    enrollmentId: consentimento.id,
    entitlementId: grant.id,
    cohort: "48h",
    policyVersion: VERSAO_DO_TESTE,
    startsAt,
    endsAt,
  });
  return { consentimento, grant, grupo };
}

/** Espelho financeiro sintético para provar fallback; não é pagamento Stripe homologado. */
export async function assinaturaDeFixture(p: Awaited<ReturnType<typeof adultoDoTeste>>, fim: Date) {
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      app: "recreio",
      subjectType: "user",
      subjectId: p.conta.id,
      email: p.conta.email,
      providerCustomerId: `cus_fixture_${randomUUID()}`,
    })
    .returning();
  if (!customer) throw new Error("Cliente de fixture ausente");
  await db.insert(subscriptions).values({
    customerId: customer.id,
    provider: "stripe",
    providerSubscriptionId: `sub_fixture_${randomUUID()}`,
    providerPriceId: "price_fixture_recreio",
    productId: "recreio_individual_monthly",
    status: "active",
    currentPeriodStart: new Date(Date.now() - 1000),
    currentPeriodEnd: fim,
  });
}
