import postgres from "postgres";
import { BARREIRA_EXECUTOR_BACKUP } from "../../src/features/backup/contrato";

export class FalhaDaExecucaoDoBackup extends Error {
  constructor(readonly codigo: "CONFIGURACAO" | "ENCERRADA" | "POSSE_PERDIDA") {
    super(`recreio.backup_execution.${codigo}`);
  }
}
export type ExecucaoDoBackup = { readonly signal: AbortSignal };
type Privada = { tx: postgres.TransactionSql; pid: number; prazo: number };
const ativas = new WeakMap<ExecucaoDoBackup, Privada>();

/** Actual coordinator transaction and advisory lock, not a caller-supplied
 * boolean. A copied/expired scope cannot authorize another phase. */
export async function conferirExecucaoDoBackup(execucao: ExecucaoDoBackup) {
  const p = ativas.get(execucao);
  if (!p || execucao.signal.aborted || performance.now() >= p.prazo)
    throw new FalhaDaExecucaoDoBackup("ENCERRADA");
  const [r] = await p.tx<{ pid: number; possui: boolean }[]>`select pg_backend_pid() as pid,
    exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory'
      and granted and classid=${BARREIRA_EXECUTOR_BACKUP.grupo}::oid
      and objid=${BARREIRA_EXECUTOR_BACKUP.chave}::oid and objsubid=2) as possui`;
  if (!r || execucao.signal.aborted || performance.now() >= p.prazo || r.pid !== p.pid || !r.possui)
    throw new FalhaDaExecucaoDoBackup("POSSE_PERDIDA");
}

/** Dedicated bounded READ ONLY transaction. Domain/control writes use their
 * existing short transactions. On loss/cancellation, wait for the owned task
 * to settle before returning so no work silently outlives the job scope. */
export async function comExecucaoExclusivaDoBackup<T>(
  config: { conexao: string; tempoLimiteMs: number },
  executar: (execucao: ExecucaoDoBackup) => Promise<T>,
) {
  let url: URL;
  try {
    url = new URL(config.conexao);
  } catch {
    throw new FalhaDaExecucaoDoBackup("CONFIGURACAO");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    url.hash ||
    [...url.searchParams.keys()].some((k) => k !== "sslmode") ||
    !["require", "disable"].includes(url.searchParams.get("sslmode") ?? "") ||
    !Number.isSafeInteger(config.tempoLimiteMs) ||
    config.tempoLimiteMs < 1000 ||
    config.tempoLimiteMs > 900000
  )
    throw new FalhaDaExecucaoDoBackup("CONFIGURACAO");
  const conexao = postgres(url.href, {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 1,
      connection: { application_name: "recreio-backup-executor" },
    }),
    ctl = new AbortController(),
    escopo = Object.freeze({ signal: ctl.signal }),
    prazo = performance.now() + config.tempoLimiteMs,
    timer = setTimeout(() => ctl.abort(), config.tempoLimiteMs);
  let tarefa: Promise<T> | undefined;
  async function coordenar() {
    return conexao.begin("read only", async (tx) => {
      await tx`select set_config('statement_timeout','2000ms',true),set_config('lock_timeout','2000ms',true),
        set_config('transaction_timeout',${`${config.tempoLimiteMs}ms`},true),
        set_config('idle_in_transaction_session_timeout',${`${config.tempoLimiteMs}ms`},true)`;
      const [r] = await tx<{ pid: number; obtida: boolean }[]>`select pg_backend_pid() as pid,
        pg_try_advisory_xact_lock(${BARREIRA_EXECUTOR_BACKUP.grupo},${BARREIRA_EXECUTOR_BACKUP.chave}) as obtida`;
      if (!r?.obtida) return { situacao: "ocupada" as const };
      ativas.set(escopo, { tx, pid: r.pid, prazo });
      tarefa = Promise.resolve().then(async () => {
        await conferirExecucaoDoBackup(escopo);
        return executar(escopo);
      });
      const valor = await tarefa;
      await conferirExecucaoDoBackup(escopo);
      return { situacao: "executada" as const, valor };
    });
  }
  let resultado:
    | { ok: true; valor: Awaited<ReturnType<typeof coordenar>> }
    | { ok: false; erro: unknown };
  try {
    resultado = { ok: true, valor: await coordenar() };
  } catch (erro) {
    ctl.abort();
    let causa: unknown = erro;
    if (tarefa) {
      const [r] = await Promise.allSettled([tarefa]);
      if (r?.status === "rejected" && r.reason !== erro)
        causa = new AggregateError([erro, r.reason], "BACKUP_COORDINATION_AND_TASK_FAILED");
    }
    resultado = { ok: false, erro: causa };
  } finally {
    ctl.abort();
    clearTimeout(timer);
    ativas.delete(escopo);
  }
  try {
    await conexao.end({ timeout: 5 });
  } catch (erro) {
    resultado = {
      ok: false,
      erro: resultado.ok
        ? erro
        : new AggregateError([resultado.erro, erro], "BACKUP_EXECUTION_AND_CLEANUP_FAILED"),
    };
  }
  if (!resultado.ok) throw resultado.erro;
  return resultado.valor;
}
