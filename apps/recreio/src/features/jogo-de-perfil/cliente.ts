import type { VersaoDeDados } from "@informach/recreio/contrato";
import { ErroDoRecreio, ehErroDoRecreio, type ModuloDoJogo } from "@informach/recreio/sdk";

/** Cliente 2D interno. Nenhum mundo, WebSocket, Three.js ou código do Morada. */
export const jogoDePerfil: ModuloDoJogo = {
  saidaPropria: true,
  montar(host, contexto, opcoes) {
    const raiz = document.createElement("section");
    raiz.className = "flex size-full flex-col items-center justify-center gap-6 overflow-auto p-6";
    raiz.dataset.jogo = "recreio-progresso-2d-cliente";
    const titulo = document.createElement("h2");
    titulo.textContent = "Colecione pontos";
    const pontos = document.createElement("output");
    pontos.setAttribute("aria-label", "Pontos salvos");
    const aviso = document.createElement("p");
    aviso.setAttribute("role", "status");
    aviso.setAttribute("aria-label", "Estado do progresso");
    const somar = document.createElement("button");
    somar.className = "rb rb-sol";
    somar.textContent = "Ganhar ponto";
    const resolver = document.createElement("button");
    resolver.className = "rb rb-vazado";
    resolver.textContent = "Usar os pontos deste aparelho";
    resolver.hidden = true;
    const escolha = document.createElement("label");
    escolha.textContent = "Versões preservadas";
    const versoes = document.createElement("select");
    versoes.className =
      "mt-2 block min-h-11 w-full rounded-controle border border-linha-forte bg-fundo px-3 py-2 text-tinta";
    escolha.append(versoes);
    escolha.hidden = true;
    const sair = document.createElement("button");
    sair.className = "rb rb-vazado";
    sair.textContent = "Salvar e sair";
    raiz.append(titulo, pontos, aviso, somar, escolha, resolver, sair);
    host.append(raiz);
    let ativo = true;
    let ocupado = true;
    let revisao = 0;
    let valor = 0;
    let conflitoId: string | null = null;
    let preservadas: VersaoDeDados[] = [];
    let operacao: Promise<void> = Promise.resolve();
    let salvandoCheckpoint: Promise<boolean> | null = null;
    let pausado = false;
    let pronto = false;
    let finalizacao: Promise<void> | null = null;
    const haConflito = () => conflitoId !== null || preservadas.length > 0;
    const atualizar = () => {
      if (!ativo) return;
      pontos.textContent = String(valor);
      somar.disabled = ocupado || haConflito() || pausado || salvandoCheckpoint !== null;
      sair.disabled =
        ocupado || haConflito() || salvandoCheckpoint !== null || finalizacao !== null;
      resolver.disabled = ocupado || pausado || salvandoCheckpoint !== null || !conflitoId;
      resolver.hidden = !haConflito();
      versoes.disabled = ocupado || pausado || salvandoCheckpoint !== null;
    };
    const mensagem = (texto: string) => {
      if (ativo) aviso.textContent = texto;
    };
    function lerPontos(dados: Uint8Array): number {
      const lido = Number(new TextDecoder("utf-8", { fatal: true }).decode(dados));
      if (!Number.isSafeInteger(lido) || lido < 0) throw new Error("Progresso inválido");
      return lido;
    }
    async function carregarVersoes() {
      const lidas = await contexto.dados.versoes("pontos");
      if (!ativo) return;
      const atual = lidas.versoes.find(
        (versao) => versao.estado === "accepted" && versao.revisao === lidas.revisaoAtual,
      );
      revisao = lidas.revisaoAtual;
      valor = atual ? lerPontos(atual.dados) : 0;
      if (!atual && revisao !== 0) throw new Error("Revisão atual ausente");
      preservadas = lidas.versoes.filter((versao) => versao.estado === "conflict");
      conflitoId = null;
      escolha.hidden = preservadas.length === 0;
      versoes.replaceChildren();
      const vazia = document.createElement("option");
      vazia.value = "";
      vazia.textContent = "Escolha uma versão para conferir";
      versoes.append(vazia);
      for (const [indice, versao] of preservadas.entries()) {
        const opcao = document.createElement("option");
        opcao.value = versao.id;
        const pontuacao = lerPontos(versao.dados);
        opcao.textContent = `Versão ${indice + 1}: ${pontuacao} ${pontuacao === 1 ? "ponto" : "pontos"}`;
        versoes.append(opcao);
      }
      resolver.textContent = "Usar versão selecionada";
    }
    const aoEscolher = () => {
      if (ocupado || pausado) return;
      const escolhida = preservadas.find((versao) => versao.id === versoes.value);
      conflitoId = escolhida?.id ?? null;
      if (escolhida) valor = lerPontos(escolhida.dados);
      atualizar();
    };
    async function salvar(): Promise<boolean> {
      try {
        revisao = await contexto.dados.gravar(
          "pontos",
          new TextEncoder().encode(String(valor)),
          revisao,
        );
        mensagem("Progresso salvo.");
        return true;
      } catch (erro) {
        if (
          ehErroDoRecreio(erro, "REVISAO_DIVERGENTE") &&
          typeof erro.detalhe.versaoId === "string"
        ) {
          conflitoId = erro.detalhe.versaoId;
          resolver.textContent = "Usar os pontos deste aparelho";
          mensagem("Há outra versão. Seus pontos foram preservados; escolha se deseja usá-los.");
        } else
          mensagem(
            "Não foi possível salvar. Seus pontos continuam nesta tela; tente novamente antes de sair.",
          );
        return false;
      }
    }
    async function jogar() {
      ocupado = true;
      valor++;
      atualizar();
      try {
        if (await salvar()) await contexto.conquista("primeiro-ponto", "primeiro-ponto-v1");
      } catch {
        // A recusa de salvar já foi exibida; nunca anunciar confirmação falsa.
        if (!conflitoId) mensagem("Operação incompleta. Tente salvar novamente antes de sair.");
      } finally {
        ocupado = false;
        atualizar();
      }
    }
    const aoSomar = () => {
      if (!ocupado && !haConflito() && !pausado && !salvandoCheckpoint) operacao = jogar();
    };
    const aoSair = () => {
      if (ocupado || haConflito() || salvandoCheckpoint || finalizacao) return;
      if (contexto.sessao.salvamento) {
        opcoes.aoSair();
        return;
      }
      if (pausado) {
        opcoes.aoSair();
        return;
      }
      ocupado = true;
      atualizar();
      operacao = salvar()
        .then((confirmado) => {
          if (ativo && confirmado) opcoes.aoSair();
        })
        .finally(() => {
          ocupado = false;
          atualizar();
        });
    };
    const aoResolver = () => {
      if (ocupado || !conflitoId || pausado || salvandoCheckpoint) return;
      ocupado = true;
      atualizar();
      const id = conflitoId;
      operacao = contexto.dados
        .versoes("pontos")
        .then(async (historico) => {
          revisao = await contexto.dados.resolver("pontos", id, historico.revisaoAtual);
          await carregarVersoes();
          mensagem(
            preservadas.length
              ? "Versão escolhida e salva. Há outras versões preservadas para conferir."
              : "Versão escolhida e salva.",
          );
        })
        .catch(() => mensagem("O conflito continua preservado. Tente novamente."))
        .finally(() => {
          ocupado = false;
          atualizar();
        });
    };
    somar.addEventListener("click", aoSomar);
    sair.addEventListener("click", aoSair);
    resolver.addEventListener("click", aoResolver);
    versoes.addEventListener("change", aoEscolher);
    atualizar();
    const inicio = carregarVersoes()
      .then(() => {
        if (!ativo) return;
        ocupado = false;
        pronto = true;
        mensagem(
          preservadas.length
            ? "Há versões preservadas. Escolha e confira qual deseja continuar."
            : "Pronto para jogar.",
        );
        atualizar();
      })
      .catch((erro: unknown) => {
        if (ativo) opcoes.aoFalhar(erro);
      });
    return {
      finalizar() {
        if (finalizacao) return finalizacao;
        const capacidade = contexto.sessao.salvamento;
        if (!capacidade) return Promise.reject(new ErroDoRecreio("SEM_PERMISSAO"));
        pausado = true;
        capacidade.parar();
        const pedido = (async () => {
          await inicio;
          await operacao;
          await salvandoCheckpoint;
          if (!ativo || !pronto) throw new ErroDoRecreio("INDISPONIVEL");
          const resultado = await capacidade.finalizarDados(
            haConflito()
              ? []
              : [{ chave: "pontos", dados: new TextEncoder().encode(String(valor)), revisao }],
          );
          if (resultado.estado === "conflicted")
            mensagem("As versões do progresso foram preservadas. Confira ao voltar.");
          else mensagem("Progresso salvo.");
        })();
        const tarefa = pedido.finally(() => {
          if (finalizacao === tarefa) finalizacao = null;
          atualizar();
        });
        finalizacao = tarefa;
        atualizar();
        return tarefa;
      },
      checkpoint() {
        if (salvandoCheckpoint) return salvandoCheckpoint;
        if (pausado) return Promise.resolve(true);
        const pedido = (async () => {
          try {
            await inicio;
            await operacao;
            if (!ativo || haConflito()) return false;
            const salvo = await salvar();
            if (salvo) pausado = true;
            return salvo;
          } finally {
            salvandoCheckpoint = null;
            atualizar();
          }
        })();
        salvandoCheckpoint = pedido;
        atualizar();
        return pedido;
      },
      retomar() {
        pausado = false;
        atualizar();
      },
      async dispose() {
        ativo = false;
        somar.removeEventListener("click", aoSomar);
        sair.removeEventListener("click", aoSair);
        resolver.removeEventListener("click", aoResolver);
        versoes.removeEventListener("change", aoEscolher);
        await inicio;
        await operacao;
        await salvandoCheckpoint;
        await finalizacao?.catch(() => undefined);
        raiz.remove();
      },
    };
  },
};
