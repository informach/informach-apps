import {
  aplicarMudancas,
  type EstadoDoMundo,
  type MoradorId,
  type Mudanca,
  type ObjetoId,
  type VisaoDoCliente,
} from "@informach/morada-sim";
import type { EstadoDaConexao } from "../rede/conexao";
import { estadoDoEspelho } from "./estado";

/**
 * O que o cliente sabe: o espelho do mundo, quem a pessoa é nele, o estado da
 * conexão e o pouco de estado de tela que a cena e o HUD dividem.
 *
 * É mutável de propósito. A cena lê o espelho direto, a cada quadro; o HUD se
 * inscreve e redesenha quando a versão sobe (`useSyncExternalStore`).
 */

export type Jogador = {
  /** Quem a pessoa é neste mundo: o id de membro, não o do perfil. */
  jogadorId: string;
  apelido: string;
  papel: string;
  janelaDeGracaMs: number;
};

export type TomDoAviso = "noticia" | "recusa" | "info";

export type Aviso = { id: number; tom: TomDoAviso; texto: string; ateMs: number };

export type AlvoDoMenu =
  | { t: "objeto"; objetoId: ObjetoId }
  | { t: "morador"; moradorId: MoradorId }
  /** Aberto pelo retrato de um bebê: os cuidados, sem depender de onde ele está na tela. */
  | { t: "cuidados"; bebeId: MoradorId };

export type MenuAberto = { alvo: AlvoDoMenu; x: number; y: number };

const DURACAO_DO_AVISO_MS = 6000;
const AVISOS_NA_TELA = 4;

/** Campos de um objeto que mudam o desenho da casa; a ocupação muda a toda hora e não entra. */
const CAMPOS_DE_FORMA = ["pos", "giro", "catalogo", "loteId", "andar", "cor"];

export class Loja {
  visao: VisaoDoCliente | null = null;
  jogador: Jogador | null = null;
  conexao: EstadoDaConexao = { fase: "conectando" };
  avisos: Aviso[] = [];
  menu: MenuAberto | null = null;
  /** O último retrato tocado: é dele o painel de necessidades enquanto a pessoa não dirige ninguém. */
  selecionadoId: MoradorId | null = null;
  paredesBaixas = true;
  contextoPerdido = false;
  /** Sobe quando a planta ou os objetos mudam de forma: a cena refaz a casa. */
  revisaoDaCasa = 0;

  private versao = 0;
  private avisado = false;
  private proximoAviso = 1;
  private readonly ouvintes = new Set<() => void>();
  private readonly agora: () => number;

  constructor(opcoes: { agora?: () => number } = {}) {
    this.agora = opcoes.agora ?? (() => Date.now());
  }

  subscribe = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  };

  getSnapshot = (): number => this.versao;

  /** Marca que algo mudou. Várias mudanças na mesma volta viram um aviso só aos inscritos. */
  tocar(): void {
    this.versao++;
    if (this.avisado) return;
    this.avisado = true;
    queueMicrotask(() => {
      this.avisado = false;
      for (const ouvinte of [...this.ouvintes]) ouvinte();
    });
  }

  receberFotografia(visao: VisaoDoCliente): void {
    this.visao = visao;
    this.revisaoDaCasa++;
    this.tocar();
  }

  receberPasso(tick: number, mudancas: readonly Mudanca[]): void {
    if (!this.visao) return;
    aplicarMudancas(this.visao, tick, mudancas);
    for (const mudanca of mudancas) {
      if (mudanca.t === "c") continue;
      if (mudanca.tabela === "imoveis" || mudanca.tabela === "lotes") this.revisaoDaCasa++;
      else if (mudanca.tabela === "objetos") {
        const mudouDeForma =
          mudanca.t === "r" || CAMPOS_DE_FORMA.some((campo) => campo in mudanca.campos);
        if (mudouDeForma) this.revisaoDaCasa++;
      }
    }
    if (mudancas.length > 0) this.tocar();
  }

  /** O espelho na forma do estado da simulação, com o tick que o cliente estima. */
  estado(tick: number): EstadoDoMundo | null {
    return this.visao ? estadoDoEspelho(this.visao, tick) : null;
  }

  /** O morador que a pessoa dirige agora, se dirige algum. */
  meuMoradorId(): MoradorId | null {
    const jogadorId = this.jogador?.jogadorId;
    if (!jogadorId || !this.visao) return null;
    const reserva = this.visao.presenca.reservas.find((r) => r.perfilId === jogadorId);
    // A visão guarda o id como texto; ele é sempre de um morador.
    return reserva ? (reserva.moradorId as MoradorId) : null;
  }

  avisar(tom: TomDoAviso, texto: string): void {
    // A mesma frase duas vezes seguidas não empilha: só renova o prazo.
    const ultimo = this.avisos[this.avisos.length - 1];
    const ateMs = this.agora() + DURACAO_DO_AVISO_MS;
    if (ultimo && ultimo.texto === texto) ultimo.ateMs = ateMs;
    else this.avisos.push({ id: this.proximoAviso++, tom, texto, ateMs });
    if (this.avisos.length > AVISOS_NA_TELA)
      this.avisos.splice(0, this.avisos.length - AVISOS_NA_TELA);
    this.tocar();
  }

  dispensarAviso(id: number): void {
    const antes = this.avisos.length;
    this.avisos = this.avisos.filter((aviso) => aviso.id !== id);
    if (this.avisos.length !== antes) this.tocar();
  }

  /** Tira os avisos que já venceram. Devolve se sobrou algum. */
  limparAvisos(): boolean {
    const agora = this.agora();
    const vivos = this.avisos.filter((aviso) => aviso.ateMs > agora);
    if (vivos.length !== this.avisos.length) {
      this.avisos = vivos;
      this.tocar();
    }
    return vivos.length > 0;
  }

  abrirMenu(menu: MenuAberto | null): void {
    this.menu = menu;
    this.tocar();
  }

  selecionar(moradorId: MoradorId | null): void {
    if (this.selecionadoId === moradorId) return;
    this.selecionadoId = moradorId;
    this.tocar();
  }

  definirConexao(estado: EstadoDaConexao): void {
    this.conexao = estado;
    this.tocar();
  }

  definirParedes(baixas: boolean): void {
    this.paredesBaixas = baixas;
    this.tocar();
  }

  definirContextoPerdido(perdido: boolean): void {
    this.contextoPerdido = perdido;
    this.tocar();
  }
}
