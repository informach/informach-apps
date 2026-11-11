import { REGRAS_DA_PROVA, REGRAS_PADRAO } from "@informach/morada-sim";
import type { ClienteDoHost, VerificadorDeSessao } from "@informach/recreio/host";
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

const log = pino({ name: "morada-server", level: process.env.LOG_LEVEL ?? "info" });

async function principal(): Promise<void> {
  const config = lerConfiguracao(process.env);
  const versao = config.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev";

  let host: ClienteDoHost;
  let verificador: VerificadorDeSessao;
  let agora: () => number = Date.now;
  let rotas: Parameters<typeof criarServidor>[0]["rotas"];
  const urlPublica = config.MORADA_PUBLIC_URL ?? `ws://localhost:${config.PORT}`;
  let origens = config.MORADA_ORIGENS;

  if (config.MORADA_PLATAFORMA === "falsa") {
    if (origens.length === 0) origens = ["http://localhost:5173", "http://localhost:3009"];
    const dev = await criarPlataformaDeDesenvolvimento({ urlPublica, origens });
    ({ host, verificador, agora, rotas } = dev);
    log.warn("plataforma de desenvolvimento em memória: nada é salvo e qualquer um entra");
  } else {
    // A ligação com o Recreio de verdade (cliente HTTP da API das instâncias e
    // chaves públicas) entra com a junção dos dois lados, no lote X1.
    throw new Error(
      "MORADA_PLATAFORMA=recreio ainda não está ligado; use falsa em desenvolvimento",
    );
  }

  const instancia = criarInstancia({
    host,
    verificador,
    agora,
    urlPublica,
    versao,
    capacidade: config.MORADA_CAPACIDADE,
    regras: config.MORADA_REGRAS === "prova" ? REGRAS_DA_PROVA : REGRAS_PADRAO,
    registrar: (evento, dados) => log.info({ evento, ...dados }),
  });
  const servidor = criarServidor({
    instancia,
    origens,
    commit: config.RAILWAY_GIT_COMMIT_SHA ?? null,
    tokenDeMetricas: config.MORADA_METRICAS_TOKEN ?? null,
    rotas,
    aoErro: (erro, contexto) => log.error({ contexto, erro }, "erro no servidor"),
  });

  const porta = await servidor.iniciar(config.PORT);
  log.info({ porta, urlPublica, plataforma: config.MORADA_PLATAFORMA }, "servidor do Morada no ar");

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
        log.error({ erro }, "falha ao encerrar");
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
}

principal().catch((erro: unknown) => {
  log.fatal(
    { erro: erro instanceof Error ? erro.message : String(erro) },
    "não foi possível iniciar",
  );
  process.exit(1);
});
