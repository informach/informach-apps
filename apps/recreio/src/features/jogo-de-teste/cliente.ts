import { CODIGOS_DE_ERRO, type CodigoDeErro } from "@informach/recreio";
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
    let meuMembro: string | null = null;

    function enviar(quadroDoCliente: DoCliente): void {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(quadroDoCliente));
    }

    const cancelarRenovacao = contexto.sessao.aoRenovar((token) => enviar({ t: "renovar", token }));

    function mostrar(estado: Extract<DoServidor, { t: "estado" }>): void {
      valor.textContent = String(estado.contador);
      lista.replaceChildren(
        ...estado.presentes.map((presente) =>
          criar(
            "li",
            "font-semibold [overflow-wrap:anywhere]",
            presente.id === meuMembro ? `${presente.apelido} (você)` : presente.apelido,
          ),
        ),
      );
      somar.disabled = false;
      aviso.textContent = "";
    }

    function parar(): void {
      encerrado = true;
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
      try {
        // A cada tentativa o Recreio diz de novo onde o mundo está: depois de
        // uma queda da instância, pode ser outra.
        const aberto = await contexto.mundos.abrir(opcoes.mundoId);
        endereco = aberto.endereco;
        meuMembro = aberto.membroId;
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
          enviar({ t: "entrar", token: contexto.sessao.token(), mundoId: opcoes.mundoId });
      });
      atual.addEventListener("message", (evento) => {
        if (socket !== atual || typeof evento.data !== "string") return;
        const recebido = lerQuadro(DoServidorSchema, evento.data);
        if (!recebido) return;
        if (recebido.t === "fim") {
          fim = recebido;
          return;
        }
        jaEntrou = true;
        tentativas = 0;
        mostrar(recebido);
      });
      atual.addEventListener("close", () => {
        if (socket !== atual) return;
        socket = null;
        if (encerrado) return;
        if (fim && !FINS_PASSAGEIROS.includes(fim.codigo)) falhar(erroDoFim(fim));
        else tentarDeNovo();
      });
    }

    somar.addEventListener("click", () => enviar({ t: "somar", id: crypto.randomUUID() }));
    sairPeloJogo.addEventListener("click", () => {
      if (encerrado) return;
      parar();
      opcoes.aoSair();
    });

    void conectar();

    return {
      dispose() {
        parar();
        raiz.remove();
      },
    };
  },
};
