import { ErroDoRecreio, ehErroDoRecreio, type MundoId } from "@informach/recreio";
import type { EncerramentoDeSessaoDeVisita, RenovacaoDeVisita } from "@informach/recreio/contrato";
import type { ClienteDoHostComVisitas } from "@informach/recreio/host";

type Registro = {
  pedido: RenovacaoDeVisita;
  cliente: ClienteDoHostComVisitas;
  estado: "admitindo" | "ativa" | "fechando";
  motivo: EncerramentoDeSessaoDeVisita["motivo"];
};

/** Inclui admissões em voo, jogadores ativos e fechamentos incertos. Não limita um mundo. */
const VINCULOS_MAX = 512;

/** Memória limitada de recibos reais; nunca anuncia encerramento antes da API negativa. */
export class SessoesVisitantesDaInstancia {
  private readonly registros = new Map<string, Registro>();
  private processando: Promise<void> | null = null;
  private readonly aposentados = new WeakSet<ClienteDoHostComVisitas>();

  constructor(private readonly registrarErro: (mundo: MundoId, erro: unknown) => void) {}

  reservar(pedido: RenovacaoDeVisita, cliente: ClienteDoHostComVisitas): void {
    if (this.aposentados.has(cliente)) throw new ErroDoRecreio("NAO_AUTENTICADO");
    const anterior = this.registros.get(pedido.sessaoDeVisitaId);
    if (anterior) {
      const p = anterior.pedido;
      if (
        p.sid !== pedido.sid ||
        p.perfilId !== pedido.perfilId ||
        p.mundoId !== pedido.mundoId ||
        p.cerca !== pedido.cerca ||
        p.visitaId !== pedido.visitaId ||
        anterior.cliente !== cliente
      )
        throw new ErroDoRecreio("SEM_PERMISSAO");
      if (anterior.estado !== "ativa") throw new ErroDoRecreio("CHECKPOINT_PENDENTE");
      anterior.estado = "admitindo";
      return;
    }
    if (this.registros.size >= VINCULOS_MAX) throw new ErroDoRecreio("INDISPONIVEL");
    this.registros.set(pedido.sessaoDeVisitaId, {
      pedido: { ...pedido },
      cliente,
      estado: "admitindo",
      motivo: "autoridade_perdida",
    });
  }

  admitir(id: string): void {
    const registro = this.registros.get(id);
    if (registro?.estado !== "admitindo") throw new ErroDoRecreio("SESSAO_ENCERRADA");
    registro.estado = "ativa";
  }

  encerrar(id: string, motivo: Registro["motivo"]): void {
    const registro = this.registros.get(id);
    if (!registro) return;
    if (registro.estado !== "fechando") registro.motivo = motivo;
    registro.estado = "fechando";
    void this.processar();
  }

  encerrarTodas(): void {
    for (const registro of this.registros.values()) registro.estado = "fechando";
    void this.processar();
  }

  /** Só após rejeição explícita da instância e parada de todos os seus mundos. */
  aposentarCliente(cliente: ClienteDoHostComVisitas): void {
    this.aposentados.add(cliente);
    for (const [id, registro] of this.registros)
      if (registro.cliente === cliente) this.registros.delete(id);
    // Não é recibo de encerramento. A autoridade/expiração e o worker do
    // Recreio continuam necessários para a geração que perdeu autenticação.
  }

  processar(): Promise<void> {
    if (this.processando) return this.processando;
    const tarefa = this.executarLote().finally(() => {
      if (this.processando === tarefa) this.processando = null;
    });
    this.processando = tarefa;
    return tarefa;
  }

  private async executarLote(): Promise<void> {
    const lista = [...this.registros].filter(([, r]) => r.estado === "fechando").slice(0, 64);
    for (let inicio = 0; inicio < lista.length; inicio += 4)
      await Promise.all(
        lista.slice(inicio, inicio + 4).map(async ([id, registro]) => {
          try {
            await registro.cliente.encerrarSessaoDeVisita({
              ...registro.pedido,
              motivo: registro.motivo,
            });
            if (this.registros.get(id) === registro) this.registros.delete(id);
          } catch (erro) {
            this.registrarErro(registro.pedido.mundoId, erro);
            if (ehErroDoRecreio(erro, "NAO_ENCONTRADO")) {
              // O vínculo já precisava existir antes da admissão. Ausência no
              // escopo imutável não pode virar uma criação tardia desta API.
              // Isso não comprova SID encerrado nem salvamento.
              if (this.registros.get(id) === registro) this.registros.delete(id);
            } else if (
              !this.aposentados.has(registro.cliente) &&
              this.registros.get(id) === registro
            ) {
              // Pendências com erro vão ao fim para não bloquear os próximos lotes.
              this.registros.delete(id);
              this.registros.set(id, registro);
            }
          }
        }),
      );
  }
}
