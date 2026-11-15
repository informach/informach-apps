import {
  conferirColocacaoNoChao,
  copiar,
  type EstadoDoMundo,
  type FamiliaId,
  GRADE_DE_EDICAO,
  LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS,
  type LoteId,
  type Objeto,
  type ObjetoId,
  type OperacaoDeEdicao,
  obter,
  type PedidoDeEdicao,
  type PontoMm,
  perfilDePintura,
  type Resultado,
  temPermissao,
} from "@informach/morada-sim";
import { textoDaRecusa } from "./textos";

type Rascunho = Omit<PedidoDeEdicao, "sequencia">;
export type PreviaDaCasa = { objeto: Objeto | null; valido: boolean; motivo: string | null };
type FonteDoEditor = {
  estado(): EstadoDoMundo | null;
  jogadorId(): string | null;
  pronto(): boolean;
  proximaSequencia(): number | null;
  versaoDoEspelho(): number;
  enviar(pedido: PedidoDeEdicao): Promise<Resultado>;
  aoMudar(): void;
};

/** Rascunho local. Só o servidor muda objeto, revisão, saldo e sequência. */
export class EditorDaCasa {
  private contexto: { familiaId: FamiliaId; loteId: LoteId } | null = null;
  private pedido: Rascunho | null = null;
  private pendente = false;
  private aviso: string | null = null;
  private alteracao = 0;
  private cache: { chave: string; previa: PreviaDaCasa } | null = null;

  constructor(private readonly fonte: FonteDoEditor) {}

  get aberto(): boolean {
    return this.contexto !== null;
  }
  get confirmando(): boolean {
    return this.pendente;
  }
  get mensagem(): string | null {
    return this.aviso;
  }
  get revisao(): number {
    return this.alteracao;
  }
  get familiaId(): FamiliaId | null {
    return this.contexto?.familiaId ?? null;
  }
  get loteId(): LoteId | null {
    return this.contexto?.loteId ?? null;
  }
  get rascunho(): Rascunho | null {
    return this.pedido ? copiar(this.pedido) : null;
  }

  private mudar(): void {
    this.alteracao++;
    this.fonte.aoMudar();
  }

  abrir(familiaId: FamiliaId): boolean {
    if (this.pendente) return false;
    const estado = this.fonte.estado(),
      autor = this.fonte.jogadorId();
    const familia = estado ? obter(estado.familias, familiaId) : null;
    if (!estado || !autor || !familia?.loteId || !temPermissao(estado, autor, familiaId, "decorar"))
      return false;
    this.contexto = { familiaId, loteId: familia.loteId };
    this.pedido = null;
    this.aviso = null;
    this.mudar();
    return true;
  }

  fechar(): boolean {
    if (this.pendente) return false;
    this.contexto = null;
    this.pedido = null;
    this.aviso = null;
    this.mudar();
    return true;
  }

  cancelarSelecao(): void {
    if (this.pendente) return;
    this.pedido = null;
    this.aviso = null;
    this.mudar();
  }

  comprar(catalogo: string): boolean {
    const estado = this.fonte.estado(),
      contexto = this.contexto;
    const lote = estado && contexto ? obter(estado.lotes, contexto.loteId) : null;
    const oferta = estado?.loja.ofertas.find((o) => o.catalogo === catalogo);
    if (this.pendente || !estado || !contexto || !lote || !oferta) return false;
    this.pedido = {
      ...contexto,
      operacao: {
        t: "comprar",
        catalogo,
        versaoDoCatalogo: oferta.versaoDoCatalogo,
        politicaDePrecos: estado.loja.politicaDePrecos,
        revisaoDoEspaco: lote.revisaoDoEspaco,
        colocacao: {
          pos: [
            Math.round(lote.entrada[0] / GRADE_DE_EDICAO) * GRADE_DE_EDICAO,
            Math.round(lote.entrada[1] / GRADE_DE_EDICAO) * GRADE_DE_EDICAO,
            0,
          ],
          andar: 0,
          giro: 0,
        },
        pintura: null,
      },
    };
    this.aviso = null;
    this.mudar();
    return true;
  }

  selecionar(objetoId: ObjetoId, acao: "mover" | "pintar" | "vender" = "mover"): boolean {
    const estado = this.fonte.estado(),
      contexto = this.contexto;
    const objeto = estado ? obter(estado.objetos, objetoId) : null;
    const lote = estado && contexto ? obter(estado.lotes, contexto.loteId) : null;
    if (
      this.pendente ||
      !estado ||
      !contexto ||
      !objeto ||
      !lote ||
      objeto.loteId !== contexto.loteId
    )
      return false;
    let operacao: OperacaoDeEdicao;
    if (acao === "pintar")
      operacao = {
        t: acao,
        objetoId,
        revisaoDoObjeto: objeto.revisao,
        pintura: copiar(objeto.pintura),
      };
    else if (acao === "vender")
      operacao = {
        t: acao,
        objetoId,
        revisaoDoObjeto: objeto.revisao,
        revisaoDoEspaco: lote.revisaoDoEspaco,
        politicaDePrecos: estado.loja.politicaDePrecos,
      };
    else {
      const giro = [0, 90, 180, 270].includes(objeto.giro) ? objeto.giro : -1;
      if (giro !== 0 && giro !== 90 && giro !== 180 && giro !== 270) return false;
      operacao = {
        t: acao,
        objetoId,
        revisaoDoObjeto: objeto.revisao,
        revisaoDoEspaco: lote.revisaoDoEspaco,
        colocacao: { pos: [...objeto.pos], andar: objeto.andar, giro },
      };
    }
    this.pedido = { ...contexto, operacao };
    this.aviso = null;
    this.mudar();
    return true;
  }

  posicionar(loteId: LoteId, pos: PontoMm): boolean {
    const operacao = this.pedido?.operacao;
    if (
      this.pendente ||
      this.contexto?.loteId !== loteId ||
      !operacao ||
      (operacao.t !== "comprar" && operacao.t !== "mover") ||
      pos.some((v) => !Number.isFinite(v))
    )
      return false;
    const [x, y] = pos.map((v) => Math.round(v / GRADE_DE_EDICAO) * GRADE_DE_EDICAO);
    if (x === undefined || y === undefined || x < 0 || y < 0 || x > 1_000_000 || y > 1_000_000)
      return false;
    operacao.colocacao.pos = [x, y, 0];
    operacao.colocacao.andar = 0;
    this.aviso = null;
    this.mudar();
    return true;
  }

  girar(): boolean {
    const operacao = this.pedido?.operacao;
    if (this.pendente || !operacao || (operacao.t !== "comprar" && operacao.t !== "mover"))
      return false;
    const giros = [0, 90, 180, 270] as const;
    operacao.colocacao.giro =
      giros[(giros.indexOf(operacao.colocacao.giro) + 1) % giros.length] ?? 0;
    this.aviso = null;
    this.mudar();
    return true;
  }

  pintar(cor: number | null): boolean {
    const estado = this.fonte.estado(),
      operacao = this.pedido?.operacao;
    if (
      this.pendente ||
      !estado ||
      !operacao ||
      (operacao.t !== "comprar" && operacao.t !== "pintar") ||
      (cor !== null && (!Number.isInteger(cor) || cor < 0 || cor > 0xffffff))
    )
      return false;
    const objeto =
      operacao.t === "comprar"
        ? { catalogo: operacao.catalogo, versao: operacao.versaoDoCatalogo }
        : obter(estado.objetos, operacao.objetoId);
    const perfil = objeto ? perfilDePintura(estado.catalogoDePinturas, objeto) : null;
    if (cor !== null && !perfil) return false;
    operacao.pintura = cor === null ? null : perfil ? { perfil: perfil.perfil, cor } : null;
    this.aviso = null;
    this.mudar();
    return true;
  }

  /** Só o gesto explícito do usuário atualiza revisões após um conflito. */
  revisar(): boolean {
    const estado = this.fonte.estado(),
      pedido = this.pedido;
    const lote = estado && pedido ? obter(estado.lotes, pedido.loteId) : null;
    if (this.pendente || !estado || !pedido || !lote) return false;
    const operacao = pedido.operacao;
    if (operacao.t !== "pintar") operacao.revisaoDoEspaco = lote.revisaoDoEspaco;
    if (operacao.t === "comprar" || operacao.t === "vender")
      operacao.politicaDePrecos = estado.loja.politicaDePrecos;
    if (operacao.t !== "comprar") {
      const objeto = obter(estado.objetos, operacao.objetoId);
      if (!objeto || objeto.loteId !== pedido.loteId) {
        this.aviso = "Este móvel já saiu da casa. Escolha outro.";
        this.mudar();
        return false;
      }
      operacao.revisaoDoObjeto = objeto.revisao;
    }
    this.aviso = null;
    this.mudar();
    return true;
  }

  prever(): PreviaDaCasa {
    const tick = this.fonte.estado()?.relogio.tick ?? 0;
    // A prévia é uma indicação; o servidor confere o estado atual na confirmação.
    // Não reconstruir duas navegações a cada quadro da cena.
    const chave = `${this.alteracao}/${this.fonte.versaoDoEspelho()}/${Math.floor(tick / 5)}`;
    if (this.cache?.chave === chave) return copiar(this.cache.previa);
    const previa = this.calcularPrevia();
    this.cache = { chave, previa };
    return copiar(previa);
  }

  private calcularPrevia(): PreviaDaCasa {
    const estado = this.fonte.estado(),
      autor = this.fonte.jogadorId(),
      pedido = this.pedido;
    const recusar = (motivo: string, objeto: Objeto | null = null): PreviaDaCasa => ({
      valido: false,
      motivo,
      objeto,
    });
    if (!estado || !autor || !pedido) return recusar("Escolha um móvel para começar.");
    const familia = obter(estado.familias, pedido.familiaId),
      lote = obter(estado.lotes, pedido.loteId);
    if (
      !familia ||
      !lote ||
      familia.loteId !== lote.id ||
      lote.familiaId !== familia.id ||
      !temPermissao(estado, autor, familia.id, "decorar")
    )
      return recusar("Você não pode editar esta casa agora.");
    const op = pedido.operacao;
    const atual = op.t === "comprar" ? null : obter(estado.objetos, op.objetoId);
    if (op.t !== "comprar" && (!atual || atual.loteId !== lote.id))
      return recusar("Este móvel já saiu da casa. Escolha outro.");
    if (
      (atual && op.t !== "comprar" && atual.revisao !== op.revisaoDoObjeto) ||
      (op.t !== "pintar" && lote.revisaoDoEspaco !== op.revisaoDoEspaco) ||
      ((op.t === "comprar" || op.t === "vender") &&
        estado.loja.politicaDePrecos !== op.politicaDePrecos)
    )
      return recusar("A casa mudou. Revise a seleção antes de confirmar.");
    const oferta = estado.loja.ofertas.find(
      (o) => o.catalogo === (op.t === "comprar" ? op.catalogo : atual?.catalogo),
    );
    const valor =
      op.t === "comprar" ? oferta?.compraCentavos : op.t === "vender" ? oferta?.revendaCentavos : 0;
    if (
      valor === undefined ||
      (op.t === "comprar" && oferta?.versaoDoCatalogo !== op.versaoDoCatalogo)
    )
      return recusar("Esta peça não está disponível na loja agora.");
    if (
      (op.t === "comprar" && !temPermissao(estado, autor, familia.id, "gastar")) ||
      (valor > LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS &&
        !temPermissao(estado, autor, familia.id, "gerir_financas"))
    )
      return recusar("Você não tem permissão para esta compra ou venda.");
    if (op.t === "comprar" && familia.fundo < valor)
      return recusar("A família não tem saldo para esta compra.");
    const objeto: Objeto | null =
      op.t === "comprar"
        ? {
            id: "obj_previa_editor",
            loteId: lote.id,
            catalogo: op.catalogo,
            versao: op.versaoDoCatalogo,
            revisao: 1,
            ...copiar(op.colocacao),
            cor: 0xffffff,
            pintura: copiar(op.pintura),
            ocupacao: {},
          }
        : atual
          ? copiar(atual)
          : null;
    if (!objeto) return recusar("Escolha outro móvel.");
    if (op.t === "mover") Object.assign(objeto, copiar(op.colocacao));
    if (op.t === "pintar") objeto.pintura = copiar(op.pintura);
    if (
      objeto.pintura &&
      perfilDePintura(estado.catalogoDePinturas, objeto)?.perfil !== objeto.pintura.perfil
    )
      return recusar("A pintura desta peça não está disponível.", objeto);
    if (Object.keys(objeto.ocupacao).length)
      return recusar("Este móvel está sendo usado. Espere ele ficar livre.", objeto);
    if (op.t !== "pintar") {
      const motivo = conferirColocacaoNoChao(estado, objeto.id, op.t === "vender" ? null : objeto);
      if (motivo) return recusar(textoDaRecusa("requisito", motivo), objeto);
    }
    if (!this.fonte.pronto()) return recusar("Espere a conexão voltar antes de confirmar.", objeto);
    if (this.fonte.proximaSequencia() === null)
      return recusar("Reabra o mundo para continuar editando.", objeto);
    return { valido: true, motivo: null, objeto };
  }

  async confirmar(opcoes: { vendaConfirmada?: boolean } = {}): Promise<Resultado | null> {
    if (this.pendente) return null;
    const previa = this.prever(),
      pedido = this.pedido,
      sequencia = this.fonte.proximaSequencia();
    if (!previa.valido || !pedido || sequencia === null) {
      this.aviso = previa.motivo;
      this.mudar();
      return null;
    }
    if (pedido.operacao.t === "vender" && !opcoes.vendaConfirmada) {
      this.aviso = "Confirme a retirada do móvel e o valor antes de vender.";
      this.mudar();
      return null;
    }
    this.pendente = true;
    this.aviso = null;
    this.mudar();
    try {
      const resposta = await this.fonte.enviar({ ...copiar(pedido), sequencia });
      if (resposta.ok) {
        this.pedido = null;
        this.aviso = "Edição confirmada.";
      } else this.aviso = textoDaRecusa(resposta.motivo, resposta.detalhe);
      return resposta;
    } catch (erro) {
      this.aviso = "Não foi possível confirmar. Confira a conexão e a casa antes de continuar.";
      throw erro;
    } finally {
      this.pendente = false;
      this.mudar();
    }
  }
}
