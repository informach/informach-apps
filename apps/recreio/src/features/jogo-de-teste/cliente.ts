import { CODIGOS_DE_ERRO, type CodigoDeErro, MundoIdSchema } from "@informach/recreio";
import { ErroDoRecreio, ehErroDoRecreio, type ModuloDoJogo } from "@informach/recreio/sdk";
import {
  type DoCliente,
  type DoServidor,
  DoServidorSchema,
  FINS_PASSAGEIROS,
  lerQuadro,
} from "./protocolo";

/**
 * Cliente do jogo de teste: um contador por mundo e a lista de quem está
 * presente. DOM puro, sem dependência nova. Faz o que todo cliente de jogo faz
 * na plataforma: abre o mundo pelo SDK, conecta no endereço que o Recreio
 * devolveu, manda a sessão no primeiro quadro (nunca no endereço), repassa a
 * sessão renovada e, se a conexão cai, abre o mundo de novo.
 *
 * Só existe em builds feitos com `RECREIO_JOGO_DE_TESTE=1`
 * (`features/jogar/registro.ts` e `features/jogar/carregadores.ts`).
 */

/** Aparece no elemento do jogo. O E2E procura este texto nos scripts que cada página baixa. */
export const MARCA_DO_JOGO_DE_TESTE = "recreio-jogo-de-teste-cliente";

/** Espera entre tentativas de reconexão: cresce até este teto. */
const ESPERA_MAX_MS = 3_000;

function criar<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag);
  elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function codigoConhecido(codigo: string): codigo is CodigoDeErro {
  return (CODIGOS_DE_ERRO as readonly string[]).includes(codigo);
}

/** O motivo que o servidor do jogo deu ao fechar, como o erro que a página entende. */
function erroDoFim(fim: Extract<DoServidor, { t: "fim" }>): ErroDoRecreio {
  if (!codigoConhecido(fim.codigo)) return new ErroDoRecreio("INDISPONIVEL");
  return new ErroDoRecreio(fim.codigo, fim.motivo === undefined ? {} : { motivo: fim.motivo });
}

export const jogoDeTeste: ModuloDoJogo = {
  montar(host, contexto, opcoes) {
    const mundoId = MundoIdSchema.parse(opcoes.mundoId);
    const raiz = criar(
      "section",
      "flex size-full flex-col items-center justify-center gap-6 overflow-auto p-6 text-center",
    );
    raiz.dataset.jogo = MARCA_DO_JOGO_DE_TESTE;
    raiz.setAttribute("aria-label", "Jogo de teste");

    const titulo = criar("h2", "font-display text-3xl font-extrabold tracking-tight", "Contador");
    const valor = criar(
      "output",
      "font-display text-7xl font-extrabold text-sol tabular-nums",
      "…",
    );
    valor.setAttribute("aria-live", "polite");
    valor.setAttribute("aria-label", "Valor do contador");
    const somar = criar("button", "rb rb-sol rb-lg", "Somar 1");
    somar.type = "button";
    somar.disabled = true;

    const aviso = criar("p", "min-h-6 text-sm font-semibold text-tinta-suave", "Conectando…");
    aviso.setAttribute("role", "status");

    const quadro = criar("div", "painel w-full max-w-sm p-5 text-left");
    const subtitulo = criar("h3", "font-display text-lg font-bold", "Quem está aqui");
    subtitulo.id = "jogo-de-teste-presentes";
    const lista = criar("ul", "mt-3 grid gap-1.5");
    lista.setAttribute("aria-labelledby", subtitulo.id);
    quadro.append(subtitulo, lista);

    const sairPeloJogo = criar("button", "rb rb-vazado", "Sair por dentro do jogo");
    sairPeloJogo.type = "button";

    raiz.append(titulo, valor, somar, aviso, quadro, sairPeloJogo);
    host.append(raiz);

    let encerrado = false;
    let socket: WebSocket | null = null;
    let espera: ReturnType<typeof setTimeout> | null = null;
    let tentativas = 0;
    /** Já esteve dentro do mundo: daqui em diante, queda é assunto do jogo, não da página. */
    let jaEntrou = false;
    let minhaParticipacao: string | null = null;
    let pausado = false;
    let visitaPausada = false;
    let finalizando: {
      promessa: Promise<void>;
      resolver: () => void;
      recusar: (erro: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    } | null = null;
    let checkpointConfirmado: string | null = null;
    let checkpointPendente: {
      id: string;
      promessa: Promise<boolean>;
      resolver: (salvo: boolean) => void;
      timer: ReturnType<typeof setTimeout>;
    } | null = null;

    function concluirCheckpoint(salvo: boolean): void {
      const pendente = checkpointPendente;
      checkpointPendente = null;
      if (!pendente) return;
      clearTimeout(pendente.timer);
      if (salvo) checkpointConfirmado = pendente.id;
      pendente.resolver(salvo);
    }

    function enviar(quadroDoCliente: DoCliente): void {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(quadroDoCliente));
    }

    const cancelarRenovacao = contexto.sessao.aoRenovar((token) => enviar({ t: "renovar", token }));

    function atualizarPausa(): void {
      somar.disabled = pausado || visitaPausada;
      aviso.textContent = pausado
        ? "Partida pausada para conferir a troca de aparelho."
        : visitaPausada
          ? "Conferindo a permissão para continuar a visita."
          : "";
    }

    function mostrar(estado: Extract<DoServidor, { t: "estado" }>): void {
      valor.textContent = String(estado.contador);
      lista.replaceChildren(
        ...estado.presentes.map((presente) =>
          criar(
            "li",
            "font-semibold [overflow-wrap:anywhere]",
            presente.id === minhaParticipacao ? `${presente.apelido} (você)` : presente.apelido,
          ),
        ),
      );
      atualizarPausa();
    }

    function parar(): void {
      encerrado = true;
      if (finalizando) {
        clearTimeout(finalizando.timer);
        finalizando.recusar(new ErroDoRecreio("INDISPONIVEL"));
        finalizando = null;
      }
      concluirCheckpoint(false);
      if (espera !== null) clearTimeout(espera);
      espera = null;
      cancelarRenovacao();
      const aberto = socket;
      socket = null;
      aberto?.close(1000);
    }

    function falhar(erro: unknown): void {
      if (encerrado) return;
      parar();
      opcoes.aoFalhar(erro);
    }

    function tentarDeNovo(): void {
      if (encerrado) return;
      somar.disabled = true;
      aviso.textContent = jaEntrou ? "Reconectando…" : "Conectando…";
      tentativas += 1;
      espera = setTimeout(
        () => {
          espera = null;
          void conectar();
        },
        Math.min(ESPERA_MAX_MS, 1_000 * tentativas),
      );
    }

    async function conectar(): Promise<void> {
      if (encerrado) return;
      let endereco: string;
      let visita: { id: string; sessaoId: string } | undefined;
      try {
        // A cada tentativa o Recreio diz de novo onde o mundo está: depois de
        // uma queda da instância, pode ser outra.
        if (contexto.visita) {
          const aberta = await contexto.visita.abrir();
          if (aberta.mundoId !== mundoId) throw new ErroDoRecreio("SEM_PERMISSAO");
          endereco = aberta.endereco;
          minhaParticipacao = aberta.sessaoDeVisitaId;
          visita = { id: aberta.visitaId, sessaoId: aberta.sessaoDeVisitaId };
        } else {
          const aberto = await contexto.mundos.abrir(mundoId);
          endereco = aberto.endereco;
          minhaParticipacao = aberto.membroId;
        }
      } catch (erro) {
        if (encerrado) return;
        // Antes da primeira entrada, toda recusa é da página (o jogo ainda
        // não começou). Depois, o que é passageiro o jogo tenta de novo.
        if (jaEntrou && ehErroDoRecreio(erro) && FINS_PASSAGEIROS.includes(erro.codigo))
          tentarDeNovo();
        else falhar(erro);
        return;
      }
      if (encerrado) return;

      const atual = new WebSocket(endereco);
      socket = atual;
      let fim: Extract<DoServidor, { t: "fim" }> | null = null;
      atual.addEventListener("open", () => {
        // A sessão vai no primeiro quadro, nunca no endereço.
        if (socket === atual)
          enviar({
            t: "entrar",
            token: contexto.sessao.token(),
            mundoId,
            ...(contexto.sessao.salvamento ? { salvamento: true } : {}),
            ...(contexto.sessao.visitas ? { visitas: true } : {}),
            ...(visita ? { visita } : {}),
          });
      });
      atual.addEventListener("message", (evento) => {
        if (socket !== atual || typeof evento.data !== "string") return;
        const recebido = lerQuadro(DoServidorSchema, evento.data);
        if (!recebido) return;
        if (recebido.t === "fim") {
          fim = recebido;
          return;
        }
        if (recebido.t === "checkpoint") {
          if (recebido.id === checkpointPendente?.id) concluirCheckpoint(recebido.confirmado);
          return;
        }
        if (recebido.t === "retomado") {
          pausado = false;
          checkpointConfirmado = null;
          atualizarPausa();
          return;
        }
        if (recebido.t === "salvamento") {
          const pendente = finalizando;
          finalizando = null;
          if (pendente) {
            clearTimeout(pendente.timer);
            if (recebido.confirmado) pendente.resolver();
            else pendente.recusar(new ErroDoRecreio("INDISPONIVEL"));
          }
          return;
        }
        if (recebido.t === "visita") {
          visitaPausada = recebido.estado === "pausada";
          atualizarPausa();
          return;
        }
        jaEntrou = true;
        tentativas = 0;
        mostrar(recebido);
      });
      atual.addEventListener("close", () => {
        if (socket !== atual) return;
        socket = null;
        concluirCheckpoint(false);
        if (encerrado) return;
        if (fim && !FINS_PASSAGEIROS.includes(fim.codigo)) falhar(erroDoFim(fim));
        else tentarDeNovo();
      });
    }

    somar.addEventListener("click", () => {
      if (!pausado && !visitaPausada) enviar({ t: "somar", id: crypto.randomUUID() });
    });
    sairPeloJogo.addEventListener("click", () => {
      if (encerrado) return;
      if (contexto.sessao.salvamento) {
        opcoes.aoSair();
        return;
      }
      parar();
      opcoes.aoSair();
    });

    void conectar();

    return {
      finalizar() {
        if (finalizando) return finalizando.promessa;
        if (!contexto.sessao.salvamento) return Promise.reject(new ErroDoRecreio("SEM_PERMISSAO"));
        contexto.sessao.salvamento.parar();
        pausado = true;
        somar.disabled = true;
        aviso.textContent = "Salvando antes de encerrar…";
        // Se o transporte já caiu, a instância tem sua margem de reconexão;
        // o host consulta o recibo e nunca aceita isto como confirmação.
        if (socket?.readyState !== WebSocket.OPEN) return Promise.resolve();
        let resolver = () => {};
        let recusar = (_erro: unknown) => {};
        const promessa = new Promise<void>((resolve, reject) => {
          resolver = resolve;
          recusar = reject;
        });
        finalizando = {
          promessa,
          resolver,
          recusar,
          timer: setTimeout(() => {
            const pendente = finalizando;
            finalizando = null;
            pendente?.recusar(new ErroDoRecreio("INDISPONIVEL"));
          }, 8000),
        };
        enviar({ t: "salvar" });
        return promessa;
      },
      checkpoint(pedido) {
        if (pedido.modo !== "server" || encerrado) return Promise.resolve(false);
        pausado = true;
        somar.disabled = true;
        if (checkpointConfirmado === pedido.id) return Promise.resolve(true);
        if (checkpointPendente?.id === pedido.id) return checkpointPendente.promessa;
        concluirCheckpoint(false);
        if (socket?.readyState !== WebSocket.OPEN) return Promise.resolve(false);
        let resolver = (_salvo: boolean) => {};
        const promessa = new Promise<boolean>((resolve) => {
          resolver = resolve;
        });
        checkpointPendente = {
          id: pedido.id,
          promessa,
          resolver,
          timer: setTimeout(() => concluirCheckpoint(false), 8000),
        };
        enviar({ t: "checkpoint", id: pedido.id });
        return promessa;
      },
      retomar() {
        if (!encerrado) enviar({ t: "retomar" });
      },
      dispose() {
        parar();
        raiz.remove();
      },
    };
  },
};
