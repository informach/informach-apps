import {
  comCoordenacaoPrivadaDeDireitos,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { minimizarProximoPerfil } from "../../src/features/direitos/minimizacao-repository";
import { AppError } from "../../src/lib/errors";
import { exigir } from "./provas-arquivos";

function barreira() {
  let resolver: (() => void) | undefined;
  const promessa = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  return {
    promessa,
    liberar() {
      if (!resolver) throw new Error("Recovery scope barrier not initialized");
      resolver();
    },
  };
}
type Resultado = { ok: true } | { ok: false; erro: unknown };

/** Real private PG and actual worker, no timers, mocks or erasure bypasses.
 * Deliberately misordered callers must not let a live child outlast its parent;
 * cancellation must block the worker before any personal mutation. */
export async function provarPrazoDaCoordenacao(
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "executar">,
  operacaoId: string,
) {
  const pronta = barreira(),
    continuar = barreira();
  let observacao: Promise<Resultado> | undefined;
  try {
    const encerrada = await comCoordenacaoPrivadaDeDireitos({
      ...config,
      executar: async (pai) => {
        const andamento = comOperacaoPrivadaDeDireitos(pai, operacaoId, async (filha) => {
          pronta.liberar();
          await continuar.promessa;
          return minimizarProximoPerfil(filha);
        });
        const observada = andamento.then(
          (): Resultado => ({ ok: true }),
          (erro: unknown): Resultado => ({ ok: false, erro }),
        );
        observacao = observada;
        await Promise.race([
          pronta.promessa,
          observada.then((r) => {
            if (!r.ok) throw r.erro;
            throw new Error("Recovery child finished before its barrier");
          }),
        ]);
        // Return the observed promise inside an object: the parent ends before
        // this intentionally late worker is released. Rejection is observed.
        return { observada };
      },
    });
    continuar.liberar();
    const r = await encerrada.observada;
    exigir(
      !r.ok && r.erro instanceof AppError && r.erro.code === "DIREITOS_LIVRO",
      "ESCOPO_FILHO_APOS_EXECUCAO",
    );
  } finally {
    continuar.liberar();
    if (observacao) await observacao;
  }
  const cancelamento = new AbortController();
  let bloqueou = false,
    rejeitou = false;
  try {
    await comCoordenacaoPrivadaDeDireitos({
      ...config,
      signal: cancelamento.signal,
      executar: async (pai) =>
        comOperacaoPrivadaDeDireitos(pai, operacaoId, async (filha) => {
          cancelamento.abort();
          try {
            await minimizarProximoPerfil(filha);
          } catch (erro) {
            if (!(erro instanceof AppError) || erro.code !== "DIREITOS_LIVRO") throw erro;
            bloqueou = true;
          }
        }),
    });
  } catch (erro) {
    if (!(erro instanceof AppError) || erro.code !== "DIREITOS_LIVRO") throw erro;
    rejeitou = true;
  }
  exigir(bloqueou && rejeitou, "ABORTO_PRIVADO_NAO_BLOQUEOU");
}
