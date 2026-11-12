import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { APP, esperarSaida, linhasDeJson, origemDoJogo, saiu, segredoDoJogo } from "./apoio";

/**
 * Apoio dos testes do Morada no portal: o servidor do jogo de verdade
 * (`apps/morada-server`) como processo filho, e o que uma pessoa vê do jogo
 * (o HUD, pelos papéis, nomes e atributos `data-*` dele). O portal não importa
 * o servidor: o teste só o inicia, derruba e lê o que ele escreve.
 *
 * Nada aqui olha dentro do jogo: o cliente é montado sem a opção de depuração,
 * como em produção. Onde clicar na cena, o teste descobre passando o ponteiro
 * por ela e lendo `data-morada-alvo*` no canvas.
 */

export const JOGO = "morada";
const PASTA_DO_SERVIDOR = path.resolve(APP, "../morada-server");

// --- O servidor do Morada, como processo filho ---

let servidor: ChildProcess | null = null;
let saida: string[] = [];

export function saidaDoServidor(): string {
  return saida.join("");
}

export function limparSaidaDoServidor(): void {
  saida = [];
}

/** O que as instâncias desta execução registraram com este nome de acontecimento. */
export function registros(evento: string): Record<string, unknown>[] {
  return linhasDeJson(saida).filter((registro) => registro.evento === evento);
}

async function pronto(): Promise<boolean> {
  try {
    return (await fetch(`${origemDoJogo(JOGO).http}/api/ready`)).ok;
  } catch {
    return false;
  }
}

async function ouvindo(): Promise<boolean> {
  try {
    return (await fetch(`${origemDoJogo(JOGO).http}/api/health`)).ok;
  } catch {
    return false;
  }
}

/**
 * O ambiente do servidor do jogo: só o que ele precisa. Nada do portal vai
 * junto: sem endereço de banco, sem a chave dos tokens e sem os segredos dos
 * outros jogos. Ele fala com o Recreio pela API das instâncias e mais nada.
 */
function ambienteDoServidor(extra: Record<string, string>): NodeJS.ProcessEnv {
  const doPortal =
    /^(DATABASE_URL|BETTER_AUTH_|RECREIO_|SENDGRID_|EMAIL_|CRON_SECRET|REDIS_URL|SENTRY_|NEXT_|STRIPE_|NODE_ENV$|PORT$)/;
  const limpo = Object.fromEntries(
    Object.entries(process.env).filter(([nome]) => !doPortal.test(nome)),
  );
  const portal = process.env.NEXT_PUBLIC_APP_URL;
  if (!portal) throw new Error("NEXT_PUBLIC_APP_URL ausente");
  const origem = origemDoJogo(JOGO);
  return {
    ...limpo,
    NODE_ENV: "development",
    PORT: String(origem.porta),
    MORADA_PLATAFORMA: "recreio",
    MORADA_REGRAS: "prova",
    RECREIO_API_URL: portal,
    RECREIO_HOST_SECRET: segredoDoJogo(JOGO),
    MORADA_PUBLIC_URL: origem.ws,
    MORADA_ORIGENS: new URL(portal).origin,
    // Com `debug` o registro traz também os batimentos e as fotografias.
    LOG_LEVEL: "debug",
    ...extra,
  };
}

/** Sobe uma instância do servidor do Morada ligada ao portal e espera ela se registrar. */
export async function iniciarServidor(extra: Record<string, string> = {}): Promise<void> {
  if (servidor) throw new Error("Já existe um servidor do Morada em execução");
  const filho = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: PASTA_DO_SERVIDOR,
    env: ambienteDoServidor(extra),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  filho.stdout?.on("data", (parte: Buffer) => saida.push(parte.toString()));
  filho.stderr?.on("data", (parte: Buffer) => saida.push(parte.toString()));
  servidor = filho;
  await expect
    .poll(pronto, { timeout: 60_000, message: "o servidor do Morada não ficou pronto" })
    .toBe(true);
}

/** Derruba a instância sem aviso, como uma queda de verdade (`SIGKILL`; no Windows, encerramento forçado). */
export async function matarServidor(): Promise<void> {
  const filho = servidor;
  servidor = null;
  if (!filho) return;
  const fim = saiu(filho);
  filho.kill("SIGKILL");
  await fim;
  await expect.poll(ouvindo, { timeout: 15_000 }).toBe(false);
}

/**
 * Descida ordenada: a instância salva os mundos e solta as posses. No Windows
 * um processo filho não recebe `SIGTERM`, então o pedido vai pelo canal de
 * mensagens, que o servidor também ouve.
 */
export async function pararServidor(): Promise<boolean> {
  const filho = servidor;
  servidor = null;
  if (!filho) return true;
  if (filho.connected) filho.send({ t: "encerrar" });
  else filho.kill("SIGTERM");
  return esperarSaida(filho, 30_000);
}

// --- O jogo, como a pessoa o vê ---

export const enderecoDoJogo = (mundoId: string) => `/jogar/${JOGO}?mundo=${mundoId}`;

export type Jogo = ReturnType<typeof jogoEm>;

/** O que o Morada mostra numa página. */
export function jogoEm(page: Page) {
  const hud = page.locator(".morada-hud");
  const retrato = (nome: string) =>
    page.locator(".morada-retrato").filter({
      has: page.locator(".morada-retrato-nome", { hasText: new RegExp(`^${nome}$`) }),
    });
  return {
    page,
    hud,
    cena: page.locator("canvas.morada-tela"),
    retratos: page.locator(".morada-retrato"),
    nomes: page.locator(".morada-retrato-nome"),
    retrato,
    presenca: page.locator(".morada-presenca"),
    hora: page.locator(".morada-hora strong"),
    dia: page.locator(".morada-hora span"),
    fila: page.locator(".morada-fila"),
    itensDaFila: page.locator(".morada-fila .morada-etiqueta"),
    preferido: page.getByRole("button", { name: "Preferido", exact: true }),
    recusa: page.locator(".morada-aviso[data-tom='recusa']"),
    faixa: page.locator(".morada-faixa"),
    sair: page.getByRole("navigation", { name: "Ferramentas da cena" }).getByRole("button", {
      name: "Sair",
    }),
    /** O botão de sair da página do Recreio, que não aparece por cima do Morada. */
    sairDaPagina: page.getByRole("button", { name: "Sair do jogo", exact: true }),
  };
}

/** Espera o mundo aparecer: conexão pronta, cena desenhada e os retratos da família. */
export async function mundoNaTela(jogo: Jogo, prazoMs = 60_000): Promise<void> {
  await expect(jogo.hud).toHaveAttribute("data-morada-conexao", "pronto", { timeout: prazoMs });
  await expect(jogo.cena).toBeVisible();
  await expect(jogo.retratos.first()).toBeVisible();
}

/** A hora do jogo que o relógio do HUD mostra, em minutos desde o começo do dia 1. */
export async function minutosDeJogo(jogo: Jogo): Promise<number> {
  const hora = (await jogo.hora.textContent()) ?? "";
  const dia = (await jogo.dia.textContent()) ?? "";
  const [hh, mm] = hora.split(":").map(Number);
  const numeroDoDia = Number(/dia (\d+)/.exec(dia)?.[1]);
  if (hh === undefined || mm === undefined || !Number.isFinite(numeroDoDia))
    throw new Error(`Relógio ilegível: "${hora}" "${dia}"`);
  return (numeroDoDia - 1) * 24 * 60 + hh * 60 + mm;
}

/** Onde o espelho diz que um morador está: a posição na planta, em milímetros, ou `null` se saiu. */
export async function localDe(retrato: Locator): Promise<[number, number] | null> {
  const local = await retrato.getAttribute("data-morada-local");
  if (!local || local === "fora") return null;
  const [x, y] = local.split(",").map(Number);
  return x === undefined || y === undefined ? null : [x, y];
}

export type AlvoNaCena = {
  /** Onde clicar, em coordenadas da página. */
  x: number;
  y: number;
  tipo: "chao" | "chao-ocupado" | "objeto" | "morador";
  nome: string;
  /** No chão: o ponto da planta, em milímetros. */
  pos: [number, number] | null;
};

/** Põe o ponteiro num ponto da página e lê o que um clique ali acertaria na cena. */
export async function oQueHa(jogo: Jogo, x: number, y: number): Promise<AlvoNaCena | null> {
  await jogo.page.mouse.move(x, y);
  const caixa = await jogo.cena.boundingBox();
  if (!caixa) return null;
  const esperado = `${Math.round(x - caixa.x)},${Math.round(y - caixa.y)}`;
  // A cena confere o ponteiro no quadro seguinte. Com o HUD por cima do ponto, não confere nunca.
  try {
    await expect(jogo.cena).toHaveAttribute("data-morada-ponteiro", esperado, { timeout: 500 });
  } catch {
    return null;
  }
  const dados = await jogo.cena.evaluate((canvas: HTMLCanvasElement) => ({ ...canvas.dataset }));
  if (dados.moradaPonteiro !== esperado || !dados.moradaAlvo) return null;
  const pos = dados.moradaAlvoPos?.split(",").map(Number);
  return {
    x,
    y,
    tipo: dados.moradaAlvo as AlvoNaCena["tipo"],
    nome: dados.moradaAlvoNome ?? "",
    pos: pos && pos.length === 2 ? [pos[0] as number, pos[1] as number] : null,
  };
}

/**
 * Passa o ponteiro pela área livre da cena, em grade, e devolve o que achou.
 * As margens deixam de fora o relógio, o trilho e os painéis de baixo.
 */
export async function varrerCena(jogo: Jogo, passo = 56): Promise<AlvoNaCena[]> {
  const caixa = await jogo.cena.boundingBox();
  if (!caixa) throw new Error("A cena não está na tela");
  const achados: AlvoNaCena[] = [];
  for (let y = caixa.y + 150; y < caixa.y + caixa.height - 260; y += passo) {
    for (let x = caixa.x + 170; x < caixa.x + caixa.width - 110; x += passo) {
      const alvo = await oQueHa(jogo, x, y);
      if (alvo) achados.push(alvo);
    }
  }
  // O ponteiro sai de cima da casa, para não ficar em cima de nada que o teste vá conferir.
  await jogo.page.mouse.move(caixa.x + caixa.width / 2, caixa.y + 4);
  return achados;
}

/**
 * Clica em um ponto da cena, conferindo antes que ele ainda é o que a varredura
 * viu (um morador pode ter passado na frente). Devolve se clicou.
 */
export async function clicarNaCena(jogo: Jogo, alvo: AlvoNaCena): Promise<boolean> {
  const agora = await oQueHa(jogo, alvo.x, alvo.y);
  if (!agora || agora.tipo !== alvo.tipo || agora.nome !== alvo.nome) return false;
  if (alvo.pos && (agora.pos?.[0] !== alvo.pos[0] || agora.pos?.[1] !== alvo.pos[1])) return false;
  await jogo.page.mouse.click(alvo.x, alvo.y);
  return true;
}
