import type { ResultadoDoEncerramento } from "./instancia";

type Opcoes = {
  salvar(): Promise<ResultadoDoEncerramento>;
  concluirObservabilidade(): Promise<void>;
  aoIniciar(motivo: string): void;
  aoFalhar(erro: unknown): void;
  sair(codigo: 0 | 1): void;
};

/** Um único desligamento, incluindo persistência, fechamento da rede e flush. */
export function criarEncerramento(opcoes: Opcoes): (motivo: string) => void {
  let iniciado = false;
  return (motivo) => {
    if (iniciado) return;
    iniciado = true;
    opcoes.aoIniciar(motivo);
    let terminado = false;
    const terminar = (codigo: 0 | 1) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(limite);
      opcoes.sair(codigo);
    };
    // Continua valendo enquanto o Sentry escoa, inclusive depois de uma falha.
    const limite = setTimeout(() => {
      opcoes.aoFalhar(new Error("O desligamento excedeu o prazo total."));
      terminar(1);
    }, 25_000);
    void (async () => {
      let codigo: 0 | 1 = 0;
      try {
        const resultado = await opcoes.salvar();
        if (resultado.falhas > 0) throw new Error("O desligamento não confirmou todos os mundos.");
      } catch (erro) {
        codigo = 1;
        opcoes.aoFalhar(erro);
      }
      try {
        await opcoes.concluirObservabilidade();
      } catch (erro) {
        codigo = 1;
        opcoes.aoFalhar(erro);
      } finally {
        terminar(codigo);
      }
    })();
  };
}
