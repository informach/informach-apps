import { ehErroDoRecreio, type ModuloDoJogo } from "@informach/recreio/sdk";

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
    const somar = document.createElement("button");
    somar.className = "rb rb-sol";
    somar.textContent = "Ganhar ponto";
    const resolver = document.createElement("button");
    resolver.className = "rb rb-vazado";
    resolver.textContent = "Usar os pontos deste aparelho";
    resolver.hidden = true;
    const sair = document.createElement("button");
    sair.className = "rb rb-vazado";
    sair.textContent = "Salvar e sair";
    raiz.append(titulo, pontos, aviso, somar, resolver, sair);
    host.append(raiz);
    let ativo = true;
    let ocupado = true;
    let revisao = 0;
    let valor = 0;
    let conflitoId: string | null = null;
    let operacao: Promise<void> = Promise.resolve();
    const atualizar = () => {
      if (!ativo) return;
      pontos.textContent = String(valor);
      somar.disabled = ocupado || conflitoId !== null;
      sair.disabled = ocupado || conflitoId !== null;
      resolver.disabled = ocupado;
      resolver.hidden = conflitoId === null;
    };
    const mensagem = (texto: string) => {
      if (ativo) aviso.textContent = texto;
    };
    function lerPontos(dados: Uint8Array): number {
      const lido = Number(new TextDecoder("utf-8", { fatal: true }).decode(dados));
      if (!Number.isSafeInteger(lido) || lido < 0) throw new Error("Progresso inválido");
      return lido;
    }
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
      if (!ocupado && !conflitoId) operacao = jogar();
    };
    const aoSair = () => {
      if (ocupado || conflitoId) return;
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
      if (ocupado || !conflitoId) return;
      ocupado = true;
      atualizar();
      const id = conflitoId;
      operacao = contexto.dados
        .versoes("pontos")
        .then(async (historico) => {
          revisao = await contexto.dados.resolver("pontos", id, historico.revisaoAtual);
          conflitoId = null;
          mensagem("Versão escolhida e salva.");
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
    atualizar();
    const inicio = contexto.dados
      .ler("pontos")
      .then((atual) => {
        if (!ativo) return;
        if (atual) {
          revisao = atual.revisao ?? 0;
          valor = lerPontos(atual.dados);
        }
        ocupado = false;
        mensagem("Pronto para jogar.");
        atualizar();
      })
      .catch((erro: unknown) => {
        if (ativo) opcoes.aoFalhar(erro);
      });
    return {
      async dispose() {
        ativo = false;
        somar.removeEventListener("click", aoSomar);
        sair.removeEventListener("click", aoSair);
        resolver.removeEventListener("click", aoResolver);
        await inicio;
        await operacao;
        raiz.remove();
      },
    };
  },
};
