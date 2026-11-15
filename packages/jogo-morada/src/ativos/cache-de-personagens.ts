import type { PacoteLido } from "./arte";

export type UsoDePersonagem = { pacote: PacoteLido; liberar(): void };
type Entrada = {
  pedido: Promise<PacoteLido | null>;
  pacote: PacoteLido | null;
  bytes: number;
  usos: number;
};

/** LRU somente de pacotes sem moradores vivos. Um empréstimo conserva o pacote. */
export class CacheDePersonagens {
  private readonly entradas = new Map<string, Entrada>();
  private readonly ociosos = new Map<string, Entrada>();
  private bytesOciosos = 0;
  private descartado = false;

  constructor(
    private readonly carregar: (arquivo: string) => Promise<PacoteLido | null>,
    private readonly medir: (pacote: PacoteLido) => number,
    private readonly soltar: (pacote: PacoteLido) => void,
    private readonly limiteBytes = 32 * 1024 * 1024,
    private readonly limitePacotes = 4,
  ) {
    if (
      !Number.isSafeInteger(limiteBytes) ||
      limiteBytes < 0 ||
      !Number.isSafeInteger(limitePacotes) ||
      limitePacotes < 0
    )
      throw new Error("Orçamento inválido do cache de personagens");
  }

  async adquirir(arquivo: string): Promise<UsoDePersonagem | null> {
    if (this.descartado) return null;
    let entrada = this.entradas.get(arquivo);
    if (!entrada) {
      const pedido: Promise<PacoteLido | null> = Promise.resolve()
        .then(() => this.carregar(arquivo))
        .then((pacote) => {
          const atual = this.entradas.get(arquivo);
          if (this.descartado || atual?.pedido !== pedido) {
            if (pacote) this.soltar(pacote);
            return null;
          }
          if (!pacote) {
            this.entradas.delete(arquivo);
            return null;
          }
          let bytes: number;
          try {
            bytes = this.medir(pacote);
            if (!Number.isSafeInteger(bytes) || bytes < 0)
              throw new Error("Tamanho decodificado inválido do personagem");
          } catch (erro) {
            this.soltar(pacote);
            this.entradas.delete(arquivo);
            throw erro;
          }
          atual.pacote = pacote;
          atual.bytes = bytes;
          return pacote;
        })
        .catch((erro) => {
          if (this.entradas.get(arquivo)?.pedido === pedido) this.entradas.delete(arquivo);
          throw erro;
        });
      entrada = { pedido, pacote: null, bytes: 0, usos: 0 };
      this.entradas.set(arquivo, entrada);
    }
    if (this.ociosos.delete(arquivo)) this.bytesOciosos -= entrada.bytes;
    entrada.usos++;
    const retida = entrada;
    const pacote = await entrada.pedido;
    if (!pacote || this.descartado) return null;
    let liberado = false;
    return {
      pacote,
      liberar: () => {
        if (liberado || this.descartado || this.entradas.get(arquivo) !== retida) return;
        liberado = true;
        retida.usos--;
        if (retida.usos === 0) {
          this.ociosos.set(arquivo, retida);
          this.bytesOciosos += retida.bytes;
          this.aparar();
        }
      },
    };
  }

  private aparar(): void {
    while (this.bytesOciosos > this.limiteBytes || this.ociosos.size > this.limitePacotes) {
      const antigo = this.ociosos.entries().next().value;
      if (!antigo) throw new Error("Contabilidade divergente do cache de personagens");
      const [arquivo, entrada] = antigo;
      this.ociosos.delete(arquivo);
      this.entradas.delete(arquivo);
      this.bytesOciosos -= entrada.bytes;
      if (entrada.pacote) this.soltar(entrada.pacote);
    }
  }

  dispose(): void {
    if (this.descartado) return;
    this.descartado = true;
    for (const entrada of this.entradas.values()) if (entrada.pacote) this.soltar(entrada.pacote);
    this.entradas.clear();
    this.ociosos.clear();
    this.bytesOciosos = 0;
  }
}
