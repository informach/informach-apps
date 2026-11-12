import { REGRAS_DA_PROVA, REGRAS_PADRAO } from "@informach/morada-sim";
import { ehErroDoRecreio } from "@informach/recreio";
import {
  type ClienteDoHost,
  criarClienteDoHost,
  criarVerificadorDeSessao,
  type VerificadorDeSessao,
} from "@informach/recreio/host";
import pino from "pino";
import { lerConfiguracao } from "./config";
import { criarPlataformaDeDesenvolvimento } from "./desenvolvimento";
import { criarInstancia } from "./instancia";
import { criarServidor } from "./servidor";

/**
 * Ponto de entrada do servidor do Morada: lê a configuração, liga a instância
 * ao Recreio (ou à plataforma de desenvolvimento), sobe a rede e cuida do
 * desligamento ordenado.
 */

const JOGO = "morada";
const log = pino({ name: "morada-server", level: process.env.LOG_LEVEL ?? "info" });

/** Acontecimentos de rotina, que só aparecem com `LOG_LEVEL=debug`. */
const DE_ROTINA = new Set(["batimento", "fotografia_gravada"]);
/** Acontecimentos que pedem a atenção de quem opera. */
const DE_ATENCAO = new Set([
  "registro_falhou",
  "registro_perdido",
  "batimento_falhou",
  "chaves_indisponiveis",
  "diario_indisponivel",
  "fotografia_indisponivel",
  "hibernacao_indisponivel",
  "encerramento_sem_salvar",
  "mundo_recomeca",
  "posse_perdida",
  "entrada_falhou",
]);

/**
 * O que a instância e o servidor contam. Os dados são sempre ids de mundo,
 * códigos e contagens, montados por quem registra: nunca um token, o segredo,
 * um apelido ou um perfil.
 */
function registrar(evento: string, dados: Record<string, unknown> = {}): void {
  const linha = { evento, ...dados };
  if (DE_ROTINA.has(evento)) log.debug(linha);
  else if (DE_ATENCAO.has(evento)) log.warn(linha);
  else log.info(linha);
}

/** Um erro para o log: o nome e o código ou a mensagem. O objeto inteiro não é registrado. */
function descrever(erro: unknown): Record<string, string> {
  if (ehErroDoRecreio(erro)) return { nome: erro.name, codigo: erro.codigo };
  if (erro instanceof Error) return { nome: erro.name, mensagem: erro.message.slice(0, 200) };
  return { nome: "desconhecido" };
}

async function principal(): Promise<void> {
  const config = lerConfiguracao(process.env);
  const versao = config.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev";

  let host: ClienteDoHost;
  let verificador: VerificadorDeSessao;
  let agora: () => number = Date.now;
  let rotas: Parameters<typeof criarServidor>[0]["rotas"];
  let urlPublica = config.MORADA_PUBLIC_URL ?? `ws://localhost:${config.PORT}`;
  let origens = config.MORADA_ORIGENS;

  if (config.MORADA_PLATAFORMA === "falsa") {
    if (origens.length === 0) origens = ["http://localhost:5173", "http://localhost:3009"];
    const dev = await criarPlataformaDeDesenvolvimento({ urlPublica, origens });
    ({ host, verificador, agora, rotas } = dev);
    log.warn("plataforma de desenvolvimento em memória: nada é salvo e qualquer um entra");
  } else {
    // A configuração já garantiu estas três.
    const api = config.RECREIO_API_URL as string;
    urlPublica = config.MORADA_PUBLIC_URL as string;
    host = criarClienteDoHost({
      baseUrl: api,
      jogo: JOGO,
      segredo: config.RECREIO_HOST_SECRET as string,
    });
    verificador = criarVerificadorDeSessao({
      emissor: config.RECREIO_EMISSOR ?? new URL(api).origin,
      jogo: JOGO,
      jwksUrl: new URL("/api/sdk/v1/jwks", api).toString(),
    });
  }

  const instancia = criarInstancia({
    host,
    verificador,
    agora,
    urlPublica,
    versao,
    capacidade: config.MORADA_CAPACIDADE,
    regras: config.MORADA_REGRAS === "prova" ? REGRAS_DA_PROVA : REGRAS_PADRAO,
    registrar,
  });
  const servidor = criarServidor({
    instancia,
    origens,
    // Com o Recreio de verdade só o portal abre o WebSocket: quem não manda origem não entra.
    exigirOrigem: config.MORADA_PLATAFORMA === "recreio",
    commit: config.RAILWAY_GIT_COMMIT_SHA ?? null,
    tokenDeMetricas: config.MORADA_METRICAS_TOKEN ?? null,
    rotas,
    registrar,
    aoErro: (erro, contexto) => log.error({ contexto, erro: descrever(erro) }, "erro no servidor"),
  });

  const porta = await servidor.iniciar(config.PORT);
  log.info(
    {
      porta,
      urlPublica,
      origens,
      plataforma: config.MORADA_PLATAFORMA,
      regras: config.MORADA_REGRAS,
      registrada: instancia.medir().registrada,
    },
    instancia.medir().registrada
      ? "servidor do Morada no ar"
      : "servidor do Morada no ar, esperando o Recreio para se registrar",
  );

  let encerrando = false;
  const encerrar = (motivo: string) => {
    if (encerrando) return;
    encerrando = true;
    log.info({ motivo }, "encerrando: salvando os mundos e soltando as posses");
    // Se o desligamento ordenado travar, sai assim mesmo: o diário garante o que é crítico.
    const limite = setTimeout(() => process.exit(1), 25_000);
    servidor.encerrar().then(
      () => {
        clearTimeout(limite);
        process.exit(0);
      },
      (erro: unknown) => {
        log.error({ erro: descrever(erro) }, "falha ao encerrar");
        process.exit(1);
      },
    );
  };
  process.on("SIGTERM", () => encerrar("SIGTERM"));
  process.on("SIGINT", () => encerrar("SIGINT"));
  // No Windows um processo filho não recebe SIGTERM: quem o gerencia manda esta mensagem.
  process.on("message", (mensagem) => {
    if ((mensagem as { t?: unknown } | null)?.t === "encerrar") encerrar("mensagem");
  });
  // Quem iniciou este processo com um canal de mensagens foi embora: não fica um servidor órfão.
  if (process.send) process.on("disconnect", () => encerrar("canal_fechado"));
}

principal().catch((erro: unknown) => {
  log.fatal(
    { erro: erro instanceof Error ? erro.message : String(erro) },
    "não foi possível iniciar",
  );
  process.exit(1);
});
