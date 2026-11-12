import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, db, eq, gt, gte, isNull, lt, ne, sql } from "@informach/db";
import {
  recreioGameSessions as gameSessions,
  recreioGameInstances as instances,
  recreioSpaceLeases as leases,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import {
  ErroDoRecreio,
  type EstadoDeMundo,
  FOTOGRAFIAS_GUARDADAS,
  type InstanciaId,
  InstanciaIdSchema,
  type MembroId,
  MembroIdSchema,
  type MundoId,
  type PapelNoMundo,
  type PerfilId,
  POSSE_TTL_MS,
  type SessaoDeJogoId,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import type {
  MetaDeFotografia,
  MotivoDeSessaoEncerrada,
  MotivoParaLiberar,
} from "@informach/recreio/contrato";
import { AGORA, type Transacao } from "@/lib/repository";
import type {
  ArmazenamentoDeMundos,
  EntradaGuardada,
  FotografiaParaGuardar,
} from "./armazenamento";
import { armazenamentoPg } from "./armazenamento-repository";

/**
 * Posse dos mundos e a API das instâncias, no banco.
 *
 * A regra que sustenta tudo: **toda operação de uma instância sobre um mundo
 * trava a linha do mundo (`FOR UPDATE`) e só então confere a posse**, na mesma
 * transação da leitura ou da escrita. A posse aberta precisa ter a cerca
 * informada, ser desta instância, estar reivindicada (`held`) e dentro do
 * prazo pelo relógio do banco. Qualquer outra coisa é `POSSE_PERDIDA`, e nada
 * muda. Abrir um mundo trava a mesma linha, então "fechar a posse vencida e
 * atribuir outra" nunca corre com uma escrita da instância antiga.
 *
 * Ordem das travas em todo o app: a linha da conta em `core.users` (quando
 * entra), a linha do mundo em `spaces`, depois o resto (posse, instância,
 * diário, fotografias).
 *
 * Os prazos usam `clock_timestamp()` (`AGORA`), não `now()`: quem esperou a
 * trava do mundo é julgado pela hora em que conseguiu, não pela hora em que
 * começou a esperar.
 */

const armazenamento: ArmazenamentoDeMundos = armazenamentoPg;

/** A validade de uma posse sem batimento. */
const TTL = sql`${`${POSSE_TTL_MS} milliseconds`}::interval`;
/** Instância calada por mais do que isto é dada como sumida pela manutenção. */
const SILENCIO_DE_INSTANCIA_SUMIDA = sql`${`${2 * POSSE_TTL_MS} milliseconds`}::interval`;

const FIM_DA_POSSE = { vazio: "empty", drenagem: "drain", erro: "error" } as const;

type MundoTravado = {
  id: string;
  status: EstadoDeMundo;
  schemaVersion: number;
  revision: number;
  journalSeq: number;
};

/** Trava a linha do mundo. Mundo de outro jogo não é encontrado, igual a um que não existe. */
async function travarMundo(
  tx: Transacao,
  mundoId: MundoId,
  jogo: string,
): Promise<MundoTravado | null> {
  const [mundo] = await tx
    .select({
      id: spaces.id,
      status: spaces.status,
      schemaVersion: spaces.schemaVersion,
      revision: spaces.revision,
      journalSeq: spaces.journalSeq,
    })
    .from(spaces)
    .where(and(eq(spaces.id, mundoId), eq(spaces.gameId, jogo)))
    .for("update");
  return mundo ?? null;
}

type PosseAberta = {
  id: string;
  fence: number;
  instanceId: string | null;
  state: "assigned" | "held" | "released";
  expiresAt: Date;
  vigente: boolean;
};

/** A posse aberta do mundo (no máximo uma), com o prazo julgado pelo relógio do banco. */
async function lerPosseAberta(tx: Transacao, mundoId: MundoId): Promise<PosseAberta | null> {
  const [posse] = await tx
    .select({
      id: leases.id,
      fence: leases.fence,
      instanceId: leases.instanceId,
      state: leases.state,
      expiresAt: leases.expiresAt,
      vigente: sql<boolean>`${leases.expiresAt} > ${AGORA}`,
    })
    .from(leases)
    .where(and(eq(leases.spaceId, mundoId), isNull(leases.releasedAt)));
  return posse ?? null;
}

export type PedidoComPosse = {
  mundoId: MundoId;
  jogo: string;
  instanciaId: InstanciaId;
  cerca: number;
};

/**
 * A conferência de toda leitura e escrita de uma instância: trava o mundo e
 * exige a posse aberta com esta cerca, desta instância, reivindicada e no
 * prazo.
 */
async function conferirPosse(
  tx: Transacao,
  pedido: PedidoComPosse,
): Promise<{ mundo: MundoTravado; posse: PosseAberta }> {
  const mundo = await travarMundo(tx, pedido.mundoId, pedido.jogo);
  if (!mundo) throw new ErroDoRecreio("NAO_ENCONTRADO");
  const posse = await lerPosseAberta(tx, pedido.mundoId);
  if (
    !posse?.vigente ||
    posse.fence !== pedido.cerca ||
    posse.instanceId !== pedido.instanciaId ||
    posse.state !== "held"
  )
    throw new ErroDoRecreio("POSSE_PERDIDA");
  return { mundo, posse };
}

// --- Instâncias ---

export async function registrarInstancia(entrada: {
  jogo: string;
  urlPublica: string;
  versao: string;
  capacidade: number;
}): Promise<InstanciaId> {
  const [instancia] = await db
    .insert(instances)
    .values({
      gameId: entrada.jogo,
      publicUrl: entrada.urlPublica,
      version: entrada.versao,
      capacity: entrada.capacidade,
      state: "active",
    })
    .returning({ id: instances.id });
  if (!instancia) throw new Error("A instância não foi gravada.");
  return InstanciaIdSchema.parse(instancia.id);
}

/** A instância existe e é deste jogo. Instância de outro jogo não é encontrada. */
export async function instanciaDoJogo(instanciaId: InstanciaId, jogo: string): Promise<boolean> {
  const [instancia] = await db
    .select({ id: instances.id })
    .from(instances)
    .where(and(eq(instances.id, instanciaId), eq(instances.gameId, jogo)));
  return instancia !== undefined;
}

export type RelatoDeMundo = { mundoId: MundoId; cerca: number; jogadores: number };

export type ResultadoDoBatimento = {
  posses: { mundoId: MundoId; estado: "ok" | "perdida"; expiraEm: number }[];
  sessoesEncerradas: { sid: SessaoDeJogoId; motivo: MotivoDeSessaoEncerrada }[];
  cursor: number;
  drenar: boolean;
};

/** Quantas sessões encerradas um batimento devolve de uma vez; o resto vem no seguinte. */
const SESSOES_POR_BATIMENTO = 500;

/**
 * As sessões de jogo deste jogo que acabaram depois do cursor, em ordem, e o
 * cursor novo. Os encerramentos são confirmados na ordem de `ended_seq` (ver
 * `sessao-de-jogo/repository.ts`), então ler "maior que o cursor" nunca pula um.
 *
 * Sem cursor (primeiro batimento da instância) valem as sessões encerradas
 * desde que ela se registrou: antes disso ela não pode ter admitido ninguém.
 * O topo da sequência é lido antes da lista, e a lista para nele: o que for
 * confirmado entre as duas leituras tem número maior e vem no próximo
 * batimento.
 */
async function sessoesEncerradasDesde(
  jogo: string,
  cursor: number | null,
  instanciaIniciadaEm: Date,
): Promise<Pick<ResultadoDoBatimento, "sessoesEncerradas" | "cursor">> {
  const campos = {
    id: gameSessions.id,
    endReason: gameSessions.endReason,
    endedSeq: gameSessions.endedSeq,
  };
  const pagina = async (filtro: ReturnType<typeof and>) => {
    const linhas = await db
      .select(campos)
      .from(gameSessions)
      .where(and(eq(gameSessions.gameId, jogo), filtro))
      .orderBy(asc(gameSessions.endedSeq))
      .limit(SESSOES_POR_BATIMENTO + 1);
    const devolvidas = linhas.slice(0, SESSOES_POR_BATIMENTO);
    return {
      sessoesEncerradas: devolvidas.map((linha) => ({
        sid: SessaoDeJogoIdSchema.parse(linha.id),
        motivo: linha.endReason ?? ("expired" as const),
      })),
      ultimo: devolvidas.at(-1)?.endedSeq ?? null,
      cortou: linhas.length > SESSOES_POR_BATIMENTO,
    };
  };

  if (cursor !== null) {
    const lida = await pagina(gt(gameSessions.endedSeq, cursor));
    return { sessoesEncerradas: lida.sessoesEncerradas, cursor: lida.ultimo ?? cursor };
  }
  const [linha] = await db
    .select({ topo: sql<number>`coalesce(max(${gameSessions.endedSeq}), 0)`.mapWith(Number) })
    .from(gameSessions);
  const topo = linha?.topo ?? 0;
  const lida = await pagina(
    and(sql`${gameSessions.endedSeq} <= ${topo}`, gte(gameSessions.endedAt, instanciaIniciadaEm)),
  );
  // Lista cortada: o cursor para no último devolvido e o resto vem depois.
  return {
    sessoesEncerradas: lida.sessoesEncerradas,
    cursor: lida.cortou ? (lida.ultimo ?? topo) : topo,
  };
}

/**
 * Batimento de uma instância: marca que ela está viva, renova cada posse
 * relatada e devolve as sessões de jogo encerradas desde o cursor.
 *
 * A renovação de cada mundo é um comando só, condicionado à posse aberta com
 * aquela cerca, desta instância e ainda no prazo: quem abre o mundo e encontra
 * a posse vencida fecha a mesma linha com a condição oposta, então uma
 * renovação e uma retomada nunca acontecem as duas. Pode não acontecer
 * nenhuma: a abertura encontra a posse no prazo e o batimento chega depois do
 * vencimento; a dona já se cercou e a próxima abertura retoma. Devolve `null`
 * se a instância não existe neste jogo.
 */
export async function registrarBatimento(entrada: {
  instanciaId: InstanciaId;
  jogo: string;
  mundos: readonly RelatoDeMundo[];
  cursor: number | null;
}): Promise<ResultadoDoBatimento | null> {
  const [instancia] = await db
    .update(instances)
    .set({
      lastSeenAt: AGORA,
      // Quem a manutenção deu como sumida e voltou a bater está viva.
      state: sql`case when ${instances.state} = 'gone' then 'active' else ${instances.state} end`,
    })
    .where(and(eq(instances.id, entrada.instanciaId), eq(instances.gameId, entrada.jogo)))
    .returning({ state: instances.state, startedAt: instances.startedAt });
  if (!instancia) return null;

  const posses: ResultadoDoBatimento["posses"] = [];
  for (const relato of entrada.mundos) {
    const jogadores = Math.min(relato.jogadores, 10_000);
    const [renovada] = await db
      .update(leases)
      .set({
        expiresAt: sql`${AGORA} + ${TTL}`,
        // Jogadores vezes os segundos desde a última renovação (o prazo menos o TTL).
        playerSeconds: sql`${leases.playerSeconds} + ${jogadores}::bigint * greatest(0, floor(extract(epoch from (${AGORA} - (${leases.expiresAt} - ${TTL})))))::bigint`,
        peakPlayers: sql`greatest(${leases.peakPlayers}, ${jogadores}::int)`,
      })
      .where(
        and(
          eq(leases.spaceId, relato.mundoId),
          isNull(leases.releasedAt),
          eq(leases.fence, relato.cerca),
          eq(leases.instanceId, entrada.instanciaId),
          sql`${leases.expiresAt} > ${AGORA}`,
          sql`exists (select 1 from recreio.spaces mundo where mundo.id = ${leases.spaceId} and mundo.game_id = ${entrada.jogo})`,
        ),
      )
      .returning({ expiresAt: leases.expiresAt });
    posses.push(
      renovada
        ? { mundoId: relato.mundoId, estado: "ok", expiraEm: renovada.expiresAt.getTime() }
        : { mundoId: relato.mundoId, estado: "perdida", expiraEm: 0 },
    );
  }

  const encerradas = await sessoesEncerradasDesde(
    entrada.jogo,
    entrada.cursor,
    instancia.startedAt,
  );
  return { posses, ...encerradas, drenar: instancia.state === "draining" };
}

/** A instância avisa que vai sair: deixa de receber mundos novos. Devolve se ela existe neste jogo. */
export async function drenarInstancia(instanciaId: InstanciaId, jogo: string): Promise<boolean> {
  const linhas = await db
    .update(instances)
    .set({ state: "draining", lastSeenAt: AGORA })
    .where(and(eq(instances.id, instanciaId), eq(instances.gameId, jogo)))
    .returning({ id: instances.id });
  return linhas.length === 1;
}

// --- Abrir um mundo (navegador) ---

export type MundoAbertoNoBanco = {
  endereco: string;
  cerca: number;
  membroId: MembroId;
  papel: PapelNoMundo;
  schemaVersion: number;
  revisao: number;
};

/** Posses abertas e no prazo de uma instância: o quanto da capacidade ela está usando. */
const possesDaInstancia = sql<number>`(select count(*)::int from recreio.space_leases posse where posse.instance_id = ${instances.id} and posse.released_at is null and posse.expires_at > ${AGORA})`;

/**
 * Escolhe a instância que vai executar o mundo: do jogo, ativa, vista dentro
 * do prazo, com vaga, a de menos mundos abertos (empate pelo id). A linha da
 * escolhida é travada e a vaga conferida de novo, para dois mundos abrindo ao
 * mesmo tempo não passarem da capacidade.
 */
async function escolherInstancia(
  tx: Transacao,
  jogo: string,
): Promise<{ id: string; publicUrl: string } | null> {
  const candidatas = await tx
    .select({ id: instances.id })
    .from(instances)
    .where(
      and(
        eq(instances.gameId, jogo),
        eq(instances.state, "active"),
        sql`${instances.lastSeenAt} > ${AGORA} - ${TTL}`,
        sql`${possesDaInstancia} < ${instances.capacity}`,
      ),
    )
    .orderBy(possesDaInstancia, asc(instances.id))
    .limit(8);
  for (const candidata of candidatas) {
    const [travada] = await tx
      .select({
        id: instances.id,
        publicUrl: instances.publicUrl,
        capacity: instances.capacity,
        abertas: possesDaInstancia,
      })
      .from(instances)
      .where(
        and(
          eq(instances.id, candidata.id),
          eq(instances.state, "active"),
          sql`${instances.lastSeenAt} > ${AGORA} - ${TTL}`,
        ),
      )
      .for("no key update");
    if (travada && travada.abertas < travada.capacity)
      return { id: travada.id, publicUrl: travada.publicUrl };
  }
  return null;
}

/**
 * O que o navegador faz ao abrir um mundo: entra na posse vigente ou faz o
 * Recreio atribuir uma nova, numa transação com a linha do mundo travada.
 *
 * Mundo que não existe, de outro jogo ou do qual o perfil não é membro ativo
 * dão a mesma recusa (`NAO_MEMBRO`). Com posse vigente, a resposta é a
 * instância dela. Sem posse, ou com a posse vencida (fechada aqui como
 * `expired`, sem esperar a manutenção), a época do mundo sobe e uma instância
 * recebe a posse nova com essa cerca. Vinte pedidos ao mesmo tempo passam um
 * de cada vez pela trava: o primeiro atribui, os outros entram.
 */
export async function abrirMundoParaMembro(entrada: {
  mundoId: MundoId;
  perfilId: PerfilId;
  jogo: string;
}): Promise<MundoAbertoNoBanco> {
  return db.transaction(async (tx) => {
    const mundo = await travarMundo(tx, entrada.mundoId, entrada.jogo);
    const [membro] = mundo
      ? await tx
          .select({ id: members.id, role: members.role, state: members.state })
          .from(members)
          .where(and(eq(members.spaceId, mundo.id), eq(members.profileId, entrada.perfilId)))
      : [];
    if (!mundo || membro?.state !== "active") throw new ErroDoRecreio("NAO_MEMBRO");
    if (mundo.status === "archived" || mundo.status === "deleted")
      throw new ErroDoRecreio("MUNDO_INDISPONIVEL");
    const aberto = (endereco: string, cerca: number): MundoAbertoNoBanco => ({
      endereco,
      cerca,
      membroId: MembroIdSchema.parse(membro.id),
      papel: membro.role,
      schemaVersion: mundo.schemaVersion,
      revisao: mundo.revision,
    });

    const enderecoDa = async (instanciaId: string | null): Promise<string | null> => {
      if (instanciaId === null) return null;
      const [dona] = await tx
        .select({ publicUrl: instances.publicUrl })
        .from(instances)
        .where(eq(instances.id, instanciaId));
      return dona?.publicUrl ?? null;
    };

    let anterior = await lerPosseAberta(tx, entrada.mundoId);
    if (anterior?.vigente) {
      const endereco = await enderecoDa(anterior.instanceId);
      if (endereco !== null) return aberto(endereco, anterior.fence);
    }
    if (anterior) {
      // Fecha a posse vencida (ou a de uma instância que não existe mais). A
      // condição do prazo é conferida de novo no comando: se um batimento
      // renovou a posse neste instante, ela continua valendo e o pedido entra nela.
      const semDona = anterior.instanceId === null;
      const fechadas = await tx
        .update(leases)
        .set({ state: "released", releasedAt: AGORA, endReason: semDona ? "error" : "expired" })
        .where(
          and(
            eq(leases.id, anterior.id),
            isNull(leases.releasedAt),
            semDona ? undefined : sql`${leases.expiresAt} <= ${AGORA}`,
          ),
        )
        .returning({ id: leases.id });
      if (fechadas.length === 0) {
        anterior = await lerPosseAberta(tx, entrada.mundoId);
        const endereco = anterior?.vigente ? await enderecoDa(anterior.instanceId) : null;
        if (!anterior || endereco === null) throw new ErroDoRecreio("INDISPONIVEL");
        return aberto(endereco, anterior.fence);
      }
    }

    const escolhida = await escolherInstancia(tx, entrada.jogo);
    if (!escolhida) throw new ErroDoRecreio("SEM_INSTANCIA");
    const [epoca] = await tx
      .update(spaces)
      .set({ leaseEpoch: sql`${spaces.leaseEpoch} + 1`, updatedAt: AGORA })
      .where(eq(spaces.id, mundo.id))
      .returning({ leaseEpoch: spaces.leaseEpoch });
    if (!epoca) throw new Error("A época do mundo não foi gravada.");
    const [posse] = await tx
      .insert(leases)
      .values({
        spaceId: mundo.id,
        fence: epoca.leaseEpoch,
        holderKind: "server",
        instanceId: escolhida.id,
        state: "assigned",
        expiresAt: sql`${AGORA} + ${TTL}`,
      })
      .returning({ id: leases.id });
    if (!posse) throw new Error("A posse não foi gravada.");
    if (anterior)
      await logAuditEventStrict(
        "recreio.space_lease_taken_over",
        null,
        {
          app: "recreio",
          spaceId: mundo.id,
          previousLeaseId: anterior.id,
          previousFence: anterior.fence,
          previousInstanceId: anterior.instanceId,
          leaseId: posse.id,
          fence: epoca.leaseEpoch,
          instanceId: escolhida.id,
        },
        { writer: tx },
      );
    return aberto(escolhida.publicUrl, epoca.leaseEpoch);
  });
}

// --- Operações de uma instância sobre um mundo ---

export type PosseReivindicadaNoBanco = {
  cerca: number;
  expiraEm: number;
  schemaVersion: number;
  revisao: number;
  diarioSeq: number;
  fotografia: MetaDeFotografia | null;
};

/**
 * A instância assume a posse que o Recreio atribuiu a ela. Repetir devolve a
 * mesma posse, renovada. Posse de outra instância: `POSSE_DE_OUTRA_INSTANCIA`,
 * com o endereço dela. Sem posse ou com ela vencida: `POSSE_PERDIDA`.
 */
export async function reivindicarPosse(entrada: {
  mundoId: MundoId;
  jogo: string;
  instanciaId: InstanciaId;
}): Promise<PosseReivindicadaNoBanco> {
  return db.transaction(async (tx) => {
    const mundo = await travarMundo(tx, entrada.mundoId, entrada.jogo);
    if (!mundo) throw new ErroDoRecreio("NAO_ENCONTRADO");
    const posse = await lerPosseAberta(tx, entrada.mundoId);
    if (!posse?.vigente) throw new ErroDoRecreio("POSSE_PERDIDA");
    if (posse.instanceId !== entrada.instanciaId) {
      const [dona] = posse.instanceId
        ? await tx
            .select({ publicUrl: instances.publicUrl })
            .from(instances)
            .where(eq(instances.id, posse.instanceId))
        : [];
      throw new ErroDoRecreio("POSSE_DE_OUTRA_INSTANCIA", { endereco: dona?.publicUrl ?? null });
    }
    const [renovada] = await tx
      .update(leases)
      .set({
        state: "held",
        claimedAt: sql`coalesce(${leases.claimedAt}, ${AGORA})`,
        expiresAt: sql`${AGORA} + ${TTL}`,
      })
      .where(eq(leases.id, posse.id))
      .returning({ expiresAt: leases.expiresAt });
    if (!renovada) throw new Error("A posse não foi gravada.");
    if (mundo.status !== "active")
      await tx
        .update(spaces)
        .set({ status: "active", updatedAt: AGORA })
        .where(eq(spaces.id, mundo.id));
    return {
      cerca: posse.fence,
      expiraEm: renovada.expiresAt.getTime(),
      schemaVersion: mundo.schemaVersion,
      revisao: mundo.revision,
      diarioSeq: mundo.journalSeq,
      fotografia: await armazenamento.ultimaFotografia(tx, entrada.mundoId),
    };
  });
}

export async function lerFotografiaDoMundo(
  pedido: PedidoComPosse,
): Promise<{ meta: MetaDeFotografia; bytes: Uint8Array } | null> {
  return db.transaction(async (tx) => {
    await conferirPosse(tx, pedido);
    return armazenamento.lerUltimaFotografia(tx, pedido.mundoId);
  });
}

export async function lerDiarioDoMundo(
  pedido: PedidoComPosse & { apos: number },
): Promise<EntradaGuardada[]> {
  return db.transaction(async (tx) => {
    await conferirPosse(tx, pedido);
    return armazenamento.lerDiario(tx, pedido.mundoId, pedido.apos);
  });
}

export type EntradaNoBanco = {
  membroId: MembroId;
  papel: PapelNoMundo;
  participacao: string | null;
  apelido: string;
  avatar: string;
  tipo: "adult" | "minor";
  versaoDaPolitica: number;
};

/**
 * A entrada de um jogador no mundo, conferida de novo no Recreio: a sessão de
 * jogo está aberta, é deste perfil e deste jogo (`SESSAO_ENCERRADA`), e o
 * perfil é membro ativo (`NAO_MEMBRO`). A sessão passa a apontar para o mundo.
 */
export async function verificarEntradaNoMundo(
  pedido: PedidoComPosse & { sid: SessaoDeJogoId; perfilId: PerfilId },
): Promise<EntradaNoBanco> {
  return db.transaction(async (tx) => {
    await conferirPosse(tx, pedido);
    const [sessao] = await tx
      .select({ id: gameSessions.id })
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.id, pedido.sid),
          eq(gameSessions.profileId, pedido.perfilId),
          eq(gameSessions.gameId, pedido.jogo),
          isNull(gameSessions.endedAt),
        ),
      );
    if (!sessao) throw new ErroDoRecreio("SESSAO_ENCERRADA");
    const [membro] = await tx
      .select({
        id: members.id,
        role: members.role,
        state: members.state,
        participation: members.participation,
        nickname: profiles.nickname,
        avatar: profiles.avatar,
        kind: profiles.kind,
        policyVersion: profiles.policyVersion,
      })
      .from(members)
      .innerJoin(profiles, eq(profiles.id, members.profileId))
      .where(and(eq(members.spaceId, pedido.mundoId), eq(members.profileId, pedido.perfilId)));
    if (membro?.state !== "active") throw new ErroDoRecreio("NAO_MEMBRO");
    // Um comando só, que não casa com sessão encerrada: se ela acabou agora, a entrada é recusada.
    const marcadas = await tx
      .update(gameSessions)
      .set({ spaceId: pedido.mundoId })
      .where(and(eq(gameSessions.id, pedido.sid), isNull(gameSessions.endedAt)))
      .returning({ id: gameSessions.id });
    if (marcadas.length === 0) throw new ErroDoRecreio("SESSAO_ENCERRADA");
    return {
      membroId: MembroIdSchema.parse(membro.id),
      papel: membro.role,
      participacao: membro.participation,
      apelido: membro.nickname,
      avatar: membro.avatar,
      tipo: membro.kind,
      versaoDaPolitica: membro.policyVersion,
    };
  });
}

function mesmosBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Anexa fatos ao diário, tudo ou nada. As entradas continuam de
 * `journal_seq + 1`, sem buracos. Repetir exatamente uma entrada já gravada
 * (mesma sequência, mesmo fato, mesmos bytes) não faz nada, e uma entrada que
 * já foi compactada só pode ser repetição. O resto fora de ordem é
 * `SEQUENCIA`, com a sequência esperada.
 */
export async function anexarAoDiarioDoMundo(
  pedido: PedidoComPosse & {
    entradas: readonly EntradaGuardada[];
    loteMaxBytes: number;
    pendenteMaxBytes: number;
  },
): Promise<{ confirmadoAte: number }> {
  return db.transaction(async (tx) => {
    const { mundo } = await conferirPosse(tx, pedido);
    const antigas = pedido.entradas.filter((entrada) => entrada.seq <= mundo.journalSeq);
    const gravadas = new Map(
      (
        await armazenamento.entradasPorSeq(
          tx,
          pedido.mundoId,
          antigas.map((entrada) => entrada.seq),
        )
      ).map((entrada) => [entrada.seq, entrada]),
    );
    const fatos = new Set(
      await armazenamento.fatosJaGravados(
        tx,
        pedido.mundoId,
        pedido.entradas.map((entrada) => entrada.fatoId),
      ),
    );
    const novas: EntradaGuardada[] = [];
    let proxima = mundo.journalSeq + 1;
    for (const entrada of pedido.entradas) {
      if (entrada.seq <= mundo.journalSeq) {
        const gravada = gravadas.get(entrada.seq);
        const repeticao =
          !gravada ||
          (gravada.fatoId === entrada.fatoId && mesmosBytes(gravada.bytes, entrada.bytes));
        if (!repeticao || novas.length > 0)
          throw new ErroDoRecreio("SEQUENCIA", { esperado: mundo.journalSeq + 1 });
        continue;
      }
      if (entrada.seq !== proxima) throw new ErroDoRecreio("SEQUENCIA", { esperado: proxima });
      if (fatos.has(entrada.fatoId)) throw new ErroDoRecreio("FATO_DUPLICADO");
      fatos.add(entrada.fatoId);
      novas.push(entrada);
      proxima++;
    }
    const tamanho = novas.reduce((total, entrada) => total + entrada.bytes.length, 0);
    if (tamanho > pedido.loteMaxBytes) throw new ErroDoRecreio("TAMANHO_EXCEDIDO");
    const coberto = (await armazenamento.ultimaFotografia(tx, pedido.mundoId))?.diarioSeq ?? 0;
    const pendente = await armazenamento.bytesDepoisDe(tx, pedido.mundoId, coberto);
    if (pendente + tamanho > pedido.pendenteMaxBytes)
      throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
    if (novas.length > 0) {
      await armazenamento.anexarAoDiario(tx, pedido.mundoId, pedido.cerca, novas);
      await tx
        .update(spaces)
        .set({ journalSeq: proxima - 1, updatedAt: AGORA })
        .where(eq(spaces.id, mundo.id));
    }
    return { confirmadoAte: proxima - 1 };
  });
}

/**
 * Grava uma fotografia sobre a revisão que a instância conhece e, na mesma
 * transação, aplica a retenção: ficam as mais novas (e as fixadas), e o diário
 * é compactado até a mais antiga que ficou.
 */
export async function gravarFotografiaDoMundo(
  pedido: PedidoComPosse & {
    revisaoEsperada: number;
    foto: Omit<FotografiaParaGuardar, "revisao" | "cerca">;
    /** O corpo passou do teto do jogo; os bytes nem foram lidos inteiros. */
    excedeuOTeto: boolean;
    resumo: { titulo: string; subtitulo: string } | null;
  },
): Promise<{ revisao: number }> {
  return db.transaction(async (tx) => {
    const { mundo } = await conferirPosse(tx, pedido);
    if (pedido.revisaoEsperada !== mundo.revision)
      throw new ErroDoRecreio("REVISAO_DIVERGENTE", { atual: mundo.revision });
    const anterior = (await armazenamento.ultimaFotografia(tx, pedido.mundoId))?.diarioSeq ?? 0;
    if (pedido.foto.diarioSeq > mundo.journalSeq || pedido.foto.diarioSeq < anterior)
      throw new ErroDoRecreio("ENTRADA_INVALIDA");
    if (pedido.excedeuOTeto) throw new ErroDoRecreio("TAMANHO_EXCEDIDO");
    const revisao = mundo.revision + 1;
    await armazenamento.gravarFotografia(tx, pedido.mundoId, {
      ...pedido.foto,
      revisao,
      cerca: pedido.cerca,
    });
    await tx
      .update(spaces)
      .set({
        revision: revisao,
        schemaVersion: pedido.foto.schemaVersion,
        ...(pedido.resumo ? { summary: pedido.resumo } : {}),
        updatedAt: AGORA,
      })
      .where(eq(spaces.id, mundo.id));
    const maisAntiga = await armazenamento.apararFotografias(
      tx,
      pedido.mundoId,
      FOTOGRAFIAS_GUARDADAS,
    );
    await armazenamento.compactarDiario(tx, pedido.mundoId, maisAntiga);
    return { revisao };
  });
}

/**
 * Solta a posse. Com `vazio` ou `drenagem` a última fotografia precisa cobrir
 * o diário inteiro (`CHECKPOINT_PENDENTE`); com `erro`, não: o diário fica e a
 * próxima instância o reaplica. O mundo volta a hibernar.
 */
export async function liberarPosseDoMundo(
  pedido: PedidoComPosse & { motivo: MotivoParaLiberar },
): Promise<void> {
  await db.transaction(async (tx) => {
    const { mundo, posse } = await conferirPosse(tx, pedido);
    if (pedido.motivo !== "erro") {
      const ultima = await armazenamento.ultimaFotografia(tx, pedido.mundoId);
      if (!ultima || ultima.diarioSeq !== mundo.journalSeq)
        throw new ErroDoRecreio("CHECKPOINT_PENDENTE");
    }
    await tx
      .update(leases)
      .set({ state: "released", releasedAt: AGORA, endReason: FIM_DA_POSSE[pedido.motivo] })
      .where(eq(leases.id, posse.id));
    await tx
      .update(spaces)
      .set({ status: "hibernating", updatedAt: AGORA })
      .where(eq(spaces.id, mundo.id));
  });
}

// --- Manutenção ---

/**
 * Fecha as posses abertas que venceram (`expired`) e põe o mundo para
 * hibernar. Cada posse na sua transação, com o mundo travado antes, na ordem
 * das travas. Repetir não faz nada: posse fechada não casa mais. Abrir um
 * mundo não espera por isto, fecha a posse vencida na hora.
 */
export async function fecharPossesVencidas(limite = 500): Promise<number> {
  const vencidas = await db
    .select({ id: leases.id, spaceId: leases.spaceId })
    .from(leases)
    .where(and(isNull(leases.releasedAt), sql`${leases.expiresAt} <= ${AGORA}`))
    .limit(limite);
  let fechadas = 0;
  for (const vencida of vencidas) {
    fechadas += await db.transaction(async (tx) => {
      await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(eq(spaces.id, vencida.spaceId))
        .for("update");
      const linhas = await tx
        .update(leases)
        .set({ state: "released", releasedAt: AGORA, endReason: "expired" })
        .where(
          and(
            eq(leases.id, vencida.id),
            isNull(leases.releasedAt),
            sql`${leases.expiresAt} <= ${AGORA}`,
          ),
        )
        .returning({ id: leases.id });
      if (linhas.length === 0) return 0;
      await tx
        .update(spaces)
        .set({ status: "hibernating", updatedAt: AGORA })
        .where(and(eq(spaces.id, vencida.spaceId), eq(spaces.status, "active")));
      return 1;
    });
  }
  return fechadas;
}

/** Marca como sumidas as instâncias caladas há mais de dois prazos de posse. Devolve quantas. */
export async function marcarInstanciasSumidas(): Promise<number> {
  const sumidas = await db
    .update(instances)
    .set({ state: "gone" })
    .where(
      and(
        ne(instances.state, "gone"),
        lt(instances.lastSeenAt, sql`${AGORA} - ${SILENCIO_DE_INSTANCIA_SUMIDA}`),
      ),
    )
    .returning({ id: instances.id });
  return sumidas.length;
}
