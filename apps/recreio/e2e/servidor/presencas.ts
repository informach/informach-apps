import type { MundoId } from "@informach/recreio";
import {
  type ClienteDoHostComPresencas,
  criarPresencaDaConexao,
  type OpcoesDaPresencaDaConexao,
  type PresencaDaConexao,
} from "@informach/recreio/host";

/** Limite de pendências técnicas deste processo, não de jogadores de um mundo. */
const PENDENCIAS_MAX = 512;
const LOTE_MAX = 64;
const CONCORRENCIA = 4;

/** Presenças da instância interna; conserva recuperação negativa fora do mundo/socket. */
export class PresencasDaInstancia {
  private readonly registros = new Map<
    PresencaDaConexao,
    { mundo: MundoId; perfil: string; fechando: boolean }
  >();

  constructor(
    private readonly host: ClienteDoHostComPresencas,
    private readonly registrarErro: (mundo: MundoId, erro: unknown) => void,
  ) {}

  abrir(
    entrada: OpcoesDaPresencaDaConexao["entrada"],
    estaConectado: () => boolean,
  ): PresencaDaConexao | null {
    // Outra conexão do mesmo participante só ganha chave depois do fechamento
    // anterior. A pendência sobrevive à remoção do jogador e à troca de SID.
    for (const [produtor, registro] of this.registros)
      if (registro.mundo === entrada.mundoId && registro.perfil === entrada.perfilId) {
        void this.fechar(produtor);
        return produtor;
      }
    if (this.registros.size >= PENDENCIAS_MAX) {
      this.registrarErro(entrada.mundoId, new Error("Fila de presenças cheia"));
      return null;
    }
    const produtor = criarPresencaDaConexao({ host: this.host, entrada, estaConectado });
    this.registros.set(produtor, {
      mundo: entrada.mundoId,
      perfil: entrada.perfilId,
      fechando: false,
    });
    void this.executar(produtor, () => produtor.atualizar());
    return produtor;
  }

  async fechar(produtor: PresencaDaConexao | null): Promise<void> {
    if (!produtor) return;
    const registro = this.registros.get(produtor);
    if (!registro) return;
    registro.fechando = true;
    await this.executar(produtor, () => produtor.encerrar());
  }

  private async executar(
    produtor: PresencaDaConexao,
    operacao: () => Promise<void>,
  ): Promise<void> {
    const registro = this.registros.get(produtor);
    if (!registro) return;
    try {
      await operacao();
    } catch (erro) {
      // O erro continua observável; a chave não é descartada nem trocada por outra.
      this.registrarErro(registro.mundo, erro);
    }
    if (produtor.concluida) this.registros.delete(produtor);
  }

  private async conferir(lista: PresencaDaConexao[], fechar: boolean): Promise<void> {
    for (let inicio = 0; inicio < lista.length; inicio += CONCORRENCIA)
      await Promise.all(
        lista
          .slice(inicio, inicio + CONCORRENCIA)
          .map((produtor) =>
            this.executar(produtor, () => (fechar ? produtor.encerrar() : produtor.atualizar())),
          ),
      );
  }

  /** Pode continuar sem renovação de posse: são apenas consultas/saídas pendentes. */
  async recuperarEncerramentos(): Promise<void> {
    await this.conferir(
      [...this.registros].filter(([, r]) => r.fechando).map(([p]) => p),
      true,
    );
  }

  /** Chamar depois do batimento de posse; nunca cria autoridade a partir de um socket antigo. */
  async sincronizar(): Promise<void> {
    await this.conferir([...this.registros.keys()], false);
    const pedidos = [...this.registros.keys()].flatMap((produtor) => {
      const pedido = produtor.renovacao();
      return pedido ? [{ produtor, pedido }] : [];
    });
    for (let inicio = 0; inicio < pedidos.length; inicio += LOTE_MAX) {
      const lote = pedidos.slice(inicio, inicio + LOTE_MAX);
      try {
        const resultado = await this.host.renovarPresencas(lote.map((p) => p.pedido));
        for (const [indice, recibo] of resultado.presencas.entries()) {
          const item = lote[indice];
          if (item && recibo.estado === "perdida") await this.fechar(item.produtor);
        }
      } catch (erro) {
        // Sem sucesso explícito, o servidor não recebe outra janela por suposição.
        const primeiro = lote[0];
        if (primeiro) this.registrarErro(primeiro.pedido.mundoId, erro);
      }
    }
  }

  async fecharTodas(): Promise<void> {
    const lista = [...this.registros.keys()];
    for (const registro of this.registros.values()) registro.fechando = true;
    await this.conferir(lista, true);
  }
}
