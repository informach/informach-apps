import { randomUUID } from "node:crypto";
import { db, ne, sql } from "@informach/db";
import { events, recreioGameInstances as instances, sessions, users } from "@informach/db/schema";
import { type ContaId, ContaIdSchema, type SessaoDeAparelhoId } from "@informach/recreio";
import {
  criarPerfilProprio,
  type PerfilDoRecreio,
  selecionarPerfil,
} from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { conceder } from "../scripts/concessoes";

/**
 * Apoio dos testes de integração. O banco é descartável (criado e apagado por
 * `scripts/isolated.mjs`), então os testes não limpam o que criam: cada um usa
 * contas novas e não depende do que os outros deixaram.
 */

export type ContaDeTeste = { id: ContaId; email: string };

/**
 * Uma conta como o login compartilhado cria: o id é um UUID, igual em forma ao
 * id de um perfil. A marca do tipo separa os dois na compilação; em execução,
 * quem separa é a consulta, que procura cada id na sua própria tabela.
 */
export async function novaConta(opcoes: { confirmada?: boolean } = {}): Promise<ContaDeTeste> {
  const id = randomUUID();
  const email = `${id}@example.test`;
  await db.insert(users).values({
    id,
    email,
    name: "Integração Recreio",
    emailVerified: opcoes.confirmada ?? true,
  });
  return { id: ContaIdSchema.parse(id), email };
}

/** Uma sessão de login qualquer para a conta, como o Better Auth entregaria. */
export function loginDe(conta: ContaDeTeste) {
  return {
    authSessionId: randomUUID(),
    contaId: conta.id,
    expiraEm: new Date(Date.now() + 7 * 86_400_000),
  };
}

/** O código do erro do Postgres por trás de uma rejeição (`23505`, `23514`, `23001`). */
export async function codigoDoBanco(operacao: Promise<unknown>): Promise<string | undefined> {
  try {
    await operacao;
    return undefined;
  } catch (erro) {
    let atual: unknown = erro;
    for (let nivel = 0; nivel < 4 && atual; nivel++) {
      if (typeof atual === "object" && "code" in atual && typeof atual.code === "string")
        return atual.code;
      atual = atual instanceof Error ? atual.cause : undefined;
    }
    return "sem-codigo";
  }
}

export const UNICO = "23505";
export const CHECAGEM = "23514";
/** `on delete restrict`: há linhas que dependem da que se tentou apagar. */
export const RESTRICAO = "23001";

/**
 * Uma sessão de login de verdade para a conta: a linha em `core.sessions` que
 * o Better Auth gravaria sem Redis. A renovação da sessão de jogo confere que
 * ela continua existindo.
 */
export async function loginReal(conta: ContaDeTeste) {
  const login = loginDe(conta);
  await db.insert(sessions).values({
    id: login.authSessionId,
    userId: conta.id,
    token: randomUUID(),
    expiresAt: login.expiraEm,
  });
  return login;
}

export type Jogador = {
  conta: ContaDeTeste;
  login: Awaited<ReturnType<typeof loginReal>>;
  perfil: PerfilDoRecreio;
  /** O ator como as rotas com cookie o montam: conta, sessão de aparelho e perfil ativo. */
  ator: { contaId: ContaId; sessaoDeAparelhoId: SessaoDeAparelhoId; perfil: PerfilDoRecreio };
};

/**
 * Uma pessoa pronta para jogar: conta confirmada, sessão de login, perfil
 * escolhido no aparelho e, salvo pedido em contrário, concessão de 30 dias.
 */
export async function novoJogador(
  opcoes: { apelido?: string; avatar?: string; comAcesso?: boolean } = {},
): Promise<Jogador> {
  const conta = await novaConta();
  const { perfil } = await criarPerfilProprio(conta.id, {
    apelido: opcoes.apelido ?? "Lia",
    avatar: opcoes.avatar ?? "padrao",
  });
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  if (!contexto) throw new Error("A sessão de aparelho deveria existir");
  await selecionarPerfil(contexto.ator, perfil.id);
  if (opcoes.comAcesso !== false)
    await conceder({ email: conta.email, tier: "individual", dias: 30, motivo: "teste" });
  return { conta, login, perfil, ator: { ...contexto.ator, perfil } };
}

/**
 * Tira de cena as instâncias que outros testes registraram: o banco é um só, e
 * uma instância viva de um teste anterior receberia os mundos deste.
 */
export async function aposentarInstancias(): Promise<void> {
  await db.update(instances).set({ state: "gone" }).where(ne(instances.state, "gone"));
}

/**
 * Adianta o relógio das posses e das instâncias: o banco julga os prazos pelo
 * próprio relógio, então em vez de esperar o teste recua os instantes gravados.
 */
export async function avancarRelogio(ms: number): Promise<void> {
  const intervalo = `${ms} milliseconds`;
  await db.execute(
    sql`update recreio.space_leases set expires_at = expires_at - ${intervalo}::interval where released_at is null`,
  );
  await db.execute(
    sql`update recreio.game_instances set last_seen_at = last_seen_at - ${intervalo}::interval`,
  );
}

/** Os eventos de auditoria do Recreio que citam este id no campo dado, do mais antigo ao mais novo. */
export async function eventosCom(campo: string, valor: string) {
  const linhas = await db
    .select({ eventType: events.eventType, actorId: events.actorId, payload: events.payload })
    .from(events)
    .where(sql`${events.payload}->>${campo} = ${valor}`)
    .orderBy(events.createdAt);
  return linhas;
}
