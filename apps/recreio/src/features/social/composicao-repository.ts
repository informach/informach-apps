import "server-only";
import { and, eq, inArray } from "@informach/db";
import {
  recreioPairedCredentials as credentials,
  recreioDeviceSessions as devices,
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
  users,
} from "@informach/db/schema";
import { ContaIdSchema, type PerfilId } from "@informach/recreio";
import { serializarContaNativa } from "@/features/account/autoridade-repository";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

export type PistaDoAutorSocial =
  | { tipo: "jogador"; referencia: ReferenciaDeJogador }
  | { tipo: "responsavel" | "equipe"; contaId: string };

export class ComposicaoSocialMudou extends AppError {
  constructor() {
    super("CONFLITO", "O contato mudou. Reabra a tela antes de continuar.");
  }
}

async function pistas(tx: Transacao, autor: PistaDoAutorSocial, ids: readonly PerfilId[]) {
  let contaDoAutor: string | null;
  if (autor.tipo !== "jogador") contaDoAutor = autor.contaId;
  else {
    const [aparelho] = await tx
      .select({ kind: devices.kind, userId: devices.userId })
      .from(devices)
      .where(eq(devices.id, autor.referencia.sessaoDeAparelhoId));
    const [pareado] =
      aparelho?.kind === "paired_device"
        ? await tx
            .select({ contaId: credentials.guardianUserId })
            .from(credentials)
            .where(eq(credentials.deviceSessionId, autor.referencia.sessaoDeAparelhoId))
        : [];
    contaDoAutor = aparelho?.kind === "account" ? aparelho.userId : (pareado?.contaId ?? null);
  }
  assertAllowed(contaDoAutor, "AUTH", "Entre novamente para continuar.");
  const [proprio] =
    autor.tipo === "responsavel"
      ? await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(and(eq(profiles.userId, contaDoAutor), eq(profiles.kind, "adult")))
      : [];
  const alvos = [...new Set([...ids, ...(proprio ? [proprio.id] : [])])].sort();
  const linhas = await tx
    .select({
      perfilId: profiles.id,
      tipo: profiles.kind,
      contaId: profiles.userId,
      vinculoId: guardians.id,
      responsavelId: guardians.guardianUserId,
    })
    .from(profiles)
    .leftJoin(guardians, eq(guardians.profileId, profiles.id))
    .where(inArray(profiles.id, alvos))
    .orderBy(profiles.id);
  return { contaDoAutor, linhas };
}

/** Apenas ordem e relações atuais. Quem chama ainda autentica o ator e autoriza a ação. */
export async function travarComposicaoSocial(
  tx: Transacao,
  autor: PistaDoAutorSocial,
  ids: readonly PerfilId[],
  antesDosPerfis?: (tx: Transacao) => Promise<void>,
) {
  assertAllowed(
    (ids.length > 0 || autor.tipo === "equipe") && ids.length <= 2,
    "CONTATO",
    "Contato não disponível.",
  );
  const inicial = await pistas(tx, autor, ids);
  const contas = [
    ...new Set([
      inicial.contaDoAutor,
      ...inicial.linhas.flatMap((p) => [p.contaId, p.responsavelId].filter((id) => id !== null)),
    ]),
  ].sort();
  for (const conta of contas) await serializarContaNativa(tx, ContaIdSchema.parse(conta));
  if (JSON.stringify(inicial) !== JSON.stringify(await pistas(tx, autor, ids)))
    throw new ComposicaoSocialMudou();
  const contasAtuais = await tx
    .select()
    .from(users)
    .where(inArray(users.id, contas))
    .orderBy(users.id)
    .for("share");
  assertAllowed(contasAtuais.length === contas.length, "CONTATO", "Contato não disponível.");
  await antesDosPerfis?.(tx);
  const perfis = await tx
    .select()
    .from(profiles)
    .where(
      inArray(
        profiles.id,
        inicial.linhas.map((p) => p.perfilId),
      ),
    )
    .orderBy(profiles.id)
    .for("update");
  const vinculos = await tx
    .select()
    .from(guardians)
    .where(
      inArray(
        guardians.profileId,
        perfis.map((p) => p.id),
      ),
    )
    .orderBy(guardians.profileId)
    .for("share");
  if (JSON.stringify(inicial) !== JSON.stringify(await pistas(tx, autor, ids)))
    throw new ComposicaoSocialMudou();
  assertAllowed(
    ids.every((id) => perfis.some((p) => p.id === id)),
    "CONTATO",
    "Contato não disponível.",
  );
  return { contaDoAutor: inicial.contaDoAutor, contas: contasAtuais, perfis, vinculos };
}
export type ComposicaoSocial = Awaited<ReturnType<typeof travarComposicaoSocial>>;
