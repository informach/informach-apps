function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function concatenar(partes, tamanho) {
  const bytes = new Uint8Array(tamanho);
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return bytes;
}

const ALVOS = [
  {
    servico: "recreio",
    url: "https://recreio.informach.com.br/api/ready",
    app: "recreio",
    projeto: "4512434887786496",
    segredo: "RECREIO_MONITOR_SENTRY_DSN",
  },
  {
    servico: "morada-server",
    url: "https://morada-server.informach.com.br/api/ready",
    projeto: "4512434887917568",
    segredo: "MORADA_MONITOR_SENTRY_DSN",
  },
];

/** Each independent probe is enabled only after its portal route is deployed. */
export function alvosDoMonitor(modoBackup, modoDireitos) {
  for (const modo of [modoBackup, modoDireitos])
    if (![undefined, "", "off", "on"].includes(modo)) throw new FalhaDaSonda("CONFIGURACAO");
  const alvos = [...ALVOS];
  for (const [modo, tipo] of [
    [modoBackup, "backup"],
    [modoDireitos, "direitos"],
  ]) {
    if (modo === "on")
      alvos.push({
        servico: `recreio-${tipo}`,
        url: `https://recreio.informach.com.br/api/${tipo}/health`,
        app: "recreio",
        projeto: "4512434887786496",
        segredo: "RECREIO_MONITOR_SENTRY_DSN",
      });
  }
  return alvos;
}

export class FalhaDaSonda extends Error {
  constructor(codigo) {
    super(codigo);
    this.codigo = codigo;
  }
}

/** O prazo inclui cabeçalhos e leitura do corpo; nunca guardar a resposta no relatório. */
export async function sondar(alvo, { prazoMs = 10_000 } = {}) {
  const inicio = performance.now();
  const sinal = AbortSignal.timeout(prazoMs);
  let resposta;
  try {
    resposta = await fetch(alvo.url, {
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: sinal,
    });
    if (resposta.status !== 200) throw new FalhaDaSonda("HTTP");
    if (!/^application\/json(?:\s*;|$)/i.test(resposta.headers.get("content-type") ?? "")) {
      throw new FalhaDaSonda("FORMATO");
    }
    if (Number(resposta.headers.get("content-length")) > 1024) {
      throw new FalhaDaSonda("TAMANHO");
    }
    if (!resposta.body) throw new FalhaDaSonda("FORMATO");
    const partes = [];
    let tamanho = 0;
    for await (const parte of resposta.body) {
      tamanho += parte.byteLength;
      if (tamanho > 1024) throw new FalhaDaSonda("TAMANHO");
      partes.push(parte);
    }
    let corpo;
    try {
      corpo = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(concatenar(partes, tamanho)),
      );
    } catch {
      throw new FalhaDaSonda("FORMATO");
    }
    if (corpo?.status !== "ready" || (alvo.app && corpo.app !== alvo.app)) {
      throw new FalhaDaSonda("PRONTIDAO");
    }
    return { ok: true, codigo: "PRONTO", duracaoMs: Math.round(performance.now() - inicio) };
  } catch (erro) {
    return {
      ok: false,
      codigo: sinal.aborted ? "PRAZO" : erro instanceof FalhaDaSonda ? erro.codigo : "REDE",
      duracaoMs: Math.round(performance.now() - inicio),
    };
  } finally {
    if (resposta?.body && !resposta.body.locked) await resposta.body.cancel().catch(() => {});
  }
}

export async function verificar(alvo, { prazoMs = 10_000, intervaloMs = 1000 } = {}) {
  let resultado;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    resultado = { ...(await sondar(alvo, { prazoMs })), tentativas: tentativa };
    if (resultado.ok || tentativa === 3) return resultado;
    await esperar(intervaloMs * tentativa);
  }
}

export function destinoSentry(dsn, projeto) {
  try {
    const url = new URL(dsn);
    if (
      url.protocol !== "https:" ||
      !/^o\d+\.ingest(?:\.[a-z0-9-]+)?\.sentry\.io$/.test(url.hostname) ||
      !/^[a-f0-9]{32}$/.test(url.username) ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== `/${projeto}`
    )
      throw new Error();
    return { url: `${url.origin}/api/${projeto}/envelope/`, dsn: url.href };
  } catch {
    throw new FalhaDaSonda("CONFIGURACAO_SENTRY");
  }
}

/** Recebe somente o resultado fechado da sonda, nunca objetos de erro/requisição. */
export function criarEnvelope(destino, servico, codigo, prova = false, origem = "github-actions") {
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const agora = new Date();
  const evento = {
    event_id: eventId,
    timestamp: agora.getTime() / 1000,
    platform: "node",
    level: prova ? "info" : "error",
    environment: "production",
    logger: "recreio.monitoramento",
    message: prova ? "recreio.external_monitor_probe" : "recreio.external_readiness_failed",
    fingerprint: ["recreio-external-readiness", servico, prova ? "probe" : "failure"],
    tags: { servico, codigo, origem },
  };
  const payload = JSON.stringify(evento);
  return {
    eventId,
    corpo: `${JSON.stringify({ event_id: eventId, sent_at: agora.toISOString(), dsn: destino.dsn })}\n${JSON.stringify({ type: "event", length: new TextEncoder().encode(payload).byteLength })}\n${payload}\n`,
  };
}

export async function enviarEnvelope(destino, envelope, { prazoMs = 10_000 } = {}) {
  let resposta;
  try {
    resposta = await fetch(destino.url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope.corpo,
      signal: AbortSignal.timeout(prazoMs),
    });
    return resposta.ok && !resposta.headers.get("x-sentry-rate-limits");
  } catch {
    return false;
  } finally {
    if (resposta?.body) await resposta.body.cancel().catch(() => {});
  }
}

export async function executarMonitoramento(
  segredos,
  { prova = false, origem = "github-actions" } = {},
) {
  // Validar todos antes de iniciar: falta de segredo nunca produz job verde silencioso.
  const alvos = alvosDoMonitor(
    segredos.RECREIO_MONITOR_BACKUP,
    segredos.RECREIO_MONITOR_DIREITOS,
  ).map((alvo) => ({
    ...alvo,
    destino: destinoSentry(segredos[alvo.segredo], alvo.projeto),
  }));
  const resultados = await Promise.all(
    alvos.map(async (alvo) => {
      const resultado = await verificar(alvo);
      const relatorio = { servico: alvo.servico, instante: new Date().toISOString(), ...resultado };
      if (!resultado.ok || prova) {
        const envelope = criarEnvelope(
          alvo.destino,
          alvo.servico,
          resultado.codigo,
          resultado.ok,
          origem,
        );
        relatorio.telemetriaEntregue = await enviarEnvelope(alvo.destino, envelope);
        relatorio.evento = envelope.eventId;
      }
      console.log(JSON.stringify(relatorio));
      return resultado.ok && relatorio.telemetriaEntregue !== false;
    }),
  );
  return resultados.every((ok) => ok);
}
