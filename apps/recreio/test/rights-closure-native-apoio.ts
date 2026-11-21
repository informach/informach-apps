import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  recreioNativePins as pins,
  sessions,
  users,
} from "@informach/db/schema";
import { expect } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import type { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { prepararEncerramentoNoBanco } from "@/features/direitos/preparacao-repository";
import { consentirEncerramentoNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import { gravarPinNativo } from "@/features/protecao/repository";
import { gerarHashDoPin } from "@/features/protecao/segredos";
import { resolverAtor } from "@/features/sessao/service";
import { eventosCom, loginReal, novaConta } from "./apoio";

/** Zero-player, no-customer closure. The image must confirm the native local
 * financial fact without instantiating any remote provider or gaining login
 * credentials, then remove its own PIN and close only this participation. */
export async function prepararEncerramentoParaImagem(config: {
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  fonte: string;
}) {
  const conta = await novaConta(),
    login = await loginReal(conta),
    contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("RIGHTS_IMAGE_CLOSURE_SESSION");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const identidade = (await db.select().from(users).where(eq(users.id, conta.id)))[0];
  expect(identidade).toBeDefined();
  await gravarPinNativo(autor, await gerarHashDoPin("482731"));
  expect(await db.select().from(pins).where(eq(pins.userId, conta.id))).toHaveLength(1);
  const previa = await prepararEncerramentoNoBanco(
    autor,
    {
      pedidoId: randomUUID(),
      tipo: "encerrar_conta",
      perfis: [],
    },
    "dev",
  );
  const epoca = (await config.storage.lerCabecalho()).documento.epoca;
  const confirmacao = await consentirEncerramentoNoBanco(
    autor,
    {
      preparacaoId: previa.preparacaoId,
      planoSha256: previa.planoSha256,
      confirmoEncerramento: true,
      confirmoRetiradaDosPerfis: true,
      confirmoCancelamentoDaRenovacao: true,
    },
    { assinatura: config.assinatura, fonte: config.fonte, epoca, modo: "dev" },
  );
  const estado = async () =>
    (await db.select().from(operations).where(eq(operations.id, confirmacao.operacaoId)))[0];
  expect((await estado())?.state).toBe("publishing");
  return {
    estado,
    async verificar() {
      const encerrada = await estado();
      expect(encerrada).toMatchObject({
        kind: "encerrar_conta",
        state: "completed",
        leaseToken: null,
        leaseUntil: null,
      });
      expect(encerrada?.completedAt).toBeInstanceOf(Date);
      const [participacao] = await db
        .select()
        .from(participations)
        .where(eq(participations.userId, conta.id));
      expect(participacao).toMatchObject({
        state: "closed",
        revision: 3,
        operationId: confirmacao.operacaoId,
      });
      expect(participacao?.closedAt).toEqual(encerrada?.completedAt);
      const [financeiro] = await db
        .select()
        .from(finances)
        .where(eq(finances.operationId, confirmacao.operacaoId));
      expect(financeiro).toMatchObject({
        state: "confirmed",
        result: "no_customer",
        leaseToken: null,
        leaseUntil: null,
      });
      expect(financeiro?.confirmedAt).toBeInstanceOf(Date);
      expect(await db.select().from(pins).where(eq(pins.userId, conta.id))).toHaveLength(0);
      expect((await db.select().from(users).where(eq(users.id, conta.id)))[0]).toEqual(identidade);
      expect(
        (await eventosCom("operationId", confirmacao.operacaoId)).filter(
          (e) => e.eventType === "recreio.account_closure_completed",
        ),
      ).toHaveLength(1);
    },
  };
}
