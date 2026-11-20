import postgres from "postgres";
import { expect, it } from "vitest";
import { BARREIRA_EXECUTOR_BACKUP } from "@/features/backup/contrato";
import {
  comExecucaoExclusivaDoBackup,
  conferirExecucaoDoBackup,
  type ExecucaoDoBackup,
} from "../scripts/backup/execucao-exclusiva";
import { conexao } from "./backup-arquivos-apoio";

function sinal() {
  let completar: (() => void) | undefined;
  const promessa = new Promise<void>((r) => {
    completar = r;
  });
  return {
    promessa,
    concluir() {
      if (!completar) throw new Error("Missing fixture resolver");
      completar();
    },
  };
}

it("exclui outro executor sem esperar e recusa cópia/uso do escopo depois do retorno", async () => {
  const config = { conexao: conexao().href, tempoLimiteMs: 15000 },
    entrou = sinal(),
    continuar = sinal();
  let emprestada: ExecucaoDoBackup | undefined,
    segundaEntrou = false;
  const tarefa = comExecucaoExclusivaDoBackup(config, async (execucao) => {
    emprestada = execucao;
    await conferirExecucaoDoBackup(execucao);
    await expect(conferirExecucaoDoBackup({ ...execucao })).rejects.toMatchObject({
      codigo: "ENCERRADA",
    });
    entrou.concluir();
    await continuar.promessa;
    await conferirExecucaoDoBackup(execucao);
    return 42;
  });
  try {
    await Promise.race([
      entrou.promessa,
      tarefa.then(() => {
        throw new Error("Executor exited before admission");
      }),
    ]);
    const segunda = await comExecucaoExclusivaDoBackup(config, async () => {
      segundaEntrou = true;
      return 0;
    });
    expect(segunda).toEqual({ situacao: "ocupada" });
    expect(segundaEntrou).toBe(false);
    continuar.concluir();
    expect(await tarefa).toEqual({ situacao: "executada", valor: 42 });
    if (!emprestada) throw new Error("Missing native scope");
    expect(emprestada.signal.aborted).toBe(true);
    await expect(conferirExecucaoDoBackup(emprestada)).rejects.toMatchObject({
      codigo: "ENCERRADA",
    });
  } finally {
    continuar.concluir();
    await Promise.allSettled([tarefa]);
  }
});

it("perder a conexão aborta novas fases e aguarda a tarefa proprietária antes de retornar", async () => {
  const url = conexao(),
    config = { conexao: url.href, tempoLimiteMs: 15000 },
    admin = postgres(url.href, { max: 1, prepare: false }),
    entrou = sinal(),
    aborto = sinal(),
    continuar = sinal();
  let retornou = false,
    novaFase = false;
  const tarefa = comExecucaoExclusivaDoBackup(config, async (execucao) => {
    execucao.signal.addEventListener("abort", () => aborto.concluir(), { once: true });
    entrou.concluir();
    await aborto.promessa;
    await continuar.promessa;
    await conferirExecucaoDoBackup(execucao);
    novaFase = true;
  });
  const observada = tarefa.then(
    (valor) => {
      retornou = true;
      return { ok: true, valor };
    },
    (erro) => {
      retornou = true;
      return { ok: false, erro };
    },
  );
  try {
    await Promise.race([
      entrou.promessa,
      observada.then(() => {
        throw new Error("Executor exited before admission");
      }),
    ]);
    const encerradas = await admin<
      { encerrada: boolean }[]
    >`select pg_terminate_backend(a.pid) as encerrada
      from pg_stat_activity a where a.datname=current_database() and a.application_name='recreio-backup-executor'
      and exists(select 1 from pg_locks l where l.pid=a.pid and l.locktype='advisory' and l.granted
        and l.classid=${BARREIRA_EXECUTOR_BACKUP.grupo}::oid and l.objid=${BARREIRA_EXECUTOR_BACKUP.chave}::oid and l.objsubid=2)`;
    expect(encerradas).toEqual([{ encerrada: true }]);
    await aborto.promessa;
    expect(retornou).toBe(false);
    continuar.concluir();
    expect((await observada).ok).toBe(false);
    expect(novaFase).toBe(false);
    expect(
      await comExecucaoExclusivaDoBackup(config, async (execucao) => {
        await conferirExecucaoDoBackup(execucao);
        return 7;
      }),
    ).toEqual({ situacao: "executada", valor: 7 });
  } finally {
    continuar.concluir();
    await observada;
    await admin.end({ timeout: 5 });
  }
});

it("erro da tarefa não retém a trava e configuração inválida não abre execução", async () => {
  const config = { conexao: conexao().href, tempoLimiteMs: 15000 },
    causa = new Error("Synthetic owned task failure");
  await expect(
    comExecucaoExclusivaDoBackup(config, async () => {
      throw causa;
    }),
  ).rejects.toBe(causa);
  await expect(
    comExecucaoExclusivaDoBackup({ ...config, tempoLimiteMs: 0 }, async () => 0),
  ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
  expect(await comExecucaoExclusivaDoBackup(config, async () => 1)).toEqual({
    situacao: "executada",
    valor: 1,
  });
});
