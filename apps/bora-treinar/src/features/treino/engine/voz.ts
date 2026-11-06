/**
 * Contagem pela voz: a pessoa diz os números ("um, dois, três…") e o app conta, sozinha ou junto
 * da câmera (quando a câmera perde uma repetição, a voz completa).
 * Usa o reconhecimento de voz do navegador (Web Speech API). No Chrome o áudio é processado pelo
 * Google e no Safari pela Apple, só enquanto o microfone está ligado; o app não grava nem guarda o
 * áudio. Por isso a primeira ativação pede consentimento (player) e a política de privacidade avisa.
 */

const UNIDADES: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  // o reconhecedor às vezes escreve como ouviu
  doi: 2,
  tres: 3,
  treis: 3,
  quatro: 4,
  cinco: 5,
  sinco: 5,
  seis: 6,
  // "meia" é o seis de quem dita número de telefone
  meia: 6,
  sete: 7,
  oito: 8,
  nove: 9,
};
const DE_DEZ: Record<string, number> = {
  dez: 10,
  deis: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  dezanove: 19,
};
const DEZENAS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50 };

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ehNumero = (p: string | undefined) =>
  p !== undefined &&
  (/^\d{1,3}$/.test(p) ||
    UNIDADES[p] !== undefined ||
    DE_DEZ[p] !== undefined ||
    DEZENAS[p] !== undefined);

/** O que a pessoa disse que mexe na contagem: um número, ou "mais um" (+1). */
export type Dito = { tipo: "numero"; n: number } | { tipo: "mais" };

/**
 * O que foi dito num trecho, em ordem: números por extenso ("vinte e um") ou em algarismos
 * ("21"), e "mais um"/"mais uma" como +1. "Um" e "uma" só são número quando vêm sozinhos ou no
 * meio de uma contagem: em "uma vez", "um pouco" ou "só um" são artigo e não contam.
 */
export function ditos(texto: string): Dito[] {
  const palavras = normalizar(texto).split(" ").filter(Boolean);
  const out: Dito[] = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i] ?? "";
    const seguinte = palavras[i + 1];
    if (p === "mais" && (seguinte === "um" || seguinte === "uma")) {
      out.push({ tipo: "mais" });
      i += 1;
      continue;
    }
    if (/^\d{1,3}$/.test(p)) {
      out.push({ tipo: "numero", n: Number(p) });
      continue;
    }
    const artigo = p === "um" || p === "uma";
    if (artigo && seguinte !== undefined && !ehNumero(seguinte)) continue;
    if (artigo && ["so", "de", "por", "nem"].includes(palavras[i - 1] ?? "")) continue;
    const unidade = UNIDADES[p];
    const deDez = DE_DEZ[p];
    const dezena = DEZENAS[p];
    if (unidade !== undefined) out.push({ tipo: "numero", n: unidade });
    else if (deDez !== undefined) out.push({ tipo: "numero", n: deDez });
    else if (dezena !== undefined) {
      const depois = UNIDADES[palavras[i + 2] ?? ""];
      if (seguinte === "e" && depois !== undefined) {
        out.push({ tipo: "numero", n: dezena + depois });
        i += 2;
      } else out.push({ tipo: "numero", n: dezena });
    }
  }
  return out;
}

/** Só os números ditos num trecho, em ordem. */
export function numerosDitos(texto: string): number[] {
  return ditos(texto).flatMap((d) => (d.tipo === "numero" ? [d.n] : []));
}

/** O maior salto aceito de uma vez: além disso, é mais provável erro de reconhecimento. */
export const SALTO_MAXIMO = 3;

/**
 * A contagem depois de ouvir `ditos`, partindo de `atual`. Só avança: um número igual ou menor
 * (repetição, eco) é ignorado, e um salto maior que SALTO_MAXIMO também. Assim um número perdido
 * pelo reconhecimento não atrasa a contagem: dizer "sete" com 5 contadas leva a 7.
 */
export function contagemPelaVoz(atual: number, falados: readonly (number | Dito)[]): number {
  let contagem = atual;
  for (const d of falados) {
    if (typeof d !== "number" && d.tipo === "mais") {
      contagem += 1;
      continue;
    }
    const n = typeof d === "number" ? d : d.n;
    if (n > contagem && n - contagem <= SALTO_MAXIMO) contagem = n;
  }
  return contagem;
}

/**
 * Junta a câmera e a voz sem contar duas vezes a mesma repetição. A câmera manda "+1"; a voz manda
 * o número dito, que só vale para frente. Quando a voz se adianta (a pessoa disse "seis" e a câmera
 * ainda não viu a sexta), a próxima repetição da câmera, se vier logo, é a mesma: é absorvida. Se a
 * câmera não confirmar em `janelaMs`, a voz fica valendo sozinha (a câmera tinha perdido).
 */
export class JuntaContagem {
  private adiantadas: number[] = [];
  constructor(private readonly janelaMs = 2500) {}

  /** A voz levou a contagem de `antes` a `depois`: lembra quantas a câmera ainda não viu. */
  voz(antes: number, depois: number, agora: number) {
    for (let i = antes; i < depois; i++) this.adiantadas.push(agora);
  }

  /** A câmera viu uma repetição: `true` se ela deve contar, `false` se a voz já contou. */
  camera(agora: number): boolean {
    this.adiantadas = this.adiantadas.filter((t) => agora - t <= this.janelaMs);
    if (!this.adiantadas.length) return true;
    this.adiantadas.shift();
    return false;
  }

  /** Série nova: nada fica adiantado de uma série para a outra. */
  zerar() {
    this.adiantadas = [];
  }
}

type Reconhecimento = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type Construtor = new () => Reconhecimento;

function construtor(): Construtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: Construtor;
    webkitSpeechRecognition?: Construtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Se este navegador reconhece voz. */
export const vozDisponivel = () => construtor() !== null;

/**
 * - `negado`: o navegador ou o sistema negou o microfone a este site;
 * - `servico`: o reconhecimento de fala está desligado no aparelho (no iPhone, o Ditado);
 * - `sem-rede`: o reconhecimento do navegador depende de internet;
 * - `sem-microfone`: o aparelho não tem microfone (ou ele está em uso por outro app);
 * - `indisponivel`: este navegador não reconhece voz (Firefox, por exemplo).
 */
export type FalhaVoz = "negado" | "servico" | "sem-rede" | "sem-microfone" | "indisponivel";

/**
 * Pede o microfone com `getUserMedia`, dentro do toque da pessoa. É o pedido que todos os
 * navegadores mostram de forma confiável; o reconhecimento de voz sozinho, em alguns, falha
 * calado ou pede de novo a cada rodada. O áudio aberto aqui é fechado na hora: quem ouve depois
 * é o reconhecimento do navegador.
 */
export async function pedirMicrofone(): Promise<"ok" | FalhaVoz> {
  if (!vozDisponivel()) return "indisponivel";
  const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!md?.getUserMedia) return "ok"; // sem a API, o próprio reconhecimento pede
  try {
    const stream = await md.getUserMedia({ audio: true });
    for (const t of stream.getTracks()) t.stop();
    return "ok";
  } catch (err) {
    const nome = (err as { name?: string }).name;
    if (nome === "NotAllowedError" || nome === "SecurityError") return "negado";
    if (nome === "NotFoundError" || nome === "NotReadableError") return "sem-microfone";
    return "ok";
  }
}

/**
 * Escuta enquanto ligado. O navegador encerra o reconhecimento depois de um silêncio; aqui ele é
 * reaberto sozinho até `parar`. No modo contínuo cada atualização traz o trecho inteiro de novo
 * ("um dois três… doze"), então `aoOuvir` recebe só os números ainda não entregues daquele trecho,
 * além do texto: uma série nova nunca reconta o que foi dito na anterior.
 */
export class OuvinteDeVoz {
  private rec: Reconhecimento | null = null;
  private ligado = false;
  /** quantos números de cada trecho (índice do resultado) já foram entregues */
  private entregues = new Map<number, number>();
  private falhasDeRede = 0;
  private reaberturas = 0;
  private ultimaReabertura = 0;
  private timer = 0;

  constructor(
    private readonly aoOuvir: (novos: Dito[], texto: string) => void,
    private readonly aoFalhar: (falha: FalhaVoz) => void,
  ) {}

  ligar() {
    const Rec = construtor();
    if (!Rec) return this.aoFalhar("indisponivel");
    if (this.ligado) return;
    this.ligado = true;
    const rec = new Rec();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const texto = e.results[i]?.[0]?.transcript;
        if (!texto) continue;
        const itens = ditos(texto);
        const ja = this.entregues.get(i) ?? 0;
        this.entregues.set(i, Math.max(ja, itens.length));
        this.falhasDeRede = 0;
        this.aoOuvir(itens.slice(ja), texto);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        this.parar();
        this.aoFalhar("negado");
      } else if (e.error === "service-not-allowed") {
        this.parar();
        this.aoFalhar("servico");
      } else if (e.error === "audio-capture") {
        this.parar();
        this.aoFalhar("sem-microfone");
      } else if (e.error === "network") {
        // a rede pisca no meio do treino: tenta de novo algumas vezes antes de desistir
        this.falhasDeRede++;
        if (this.falhasDeRede > 3) {
          this.parar();
          this.aoFalhar("sem-rede");
        }
      }
      // "no-speech" e "aborted" só encerram a rodada; onend reabre
    };
    rec.onend = () => {
      // a rodada seguinte numera os trechos de novo a partir de zero
      this.entregues.clear();
      if (!this.ligado || this.rec !== rec) return;
      // o navegador encerra a cada silêncio; reabre na hora, mas com espera crescente quando
      // encerra seguido (sem rede ou em loop), para não martelar o reconhecimento
      const agora = Date.now();
      this.reaberturas = agora - this.ultimaReabertura < 1500 ? this.reaberturas + 1 : 0;
      this.ultimaReabertura = agora;
      const espera = this.reaberturas < 3 ? 0 : Math.min(4000, 250 * 2 ** (this.reaberturas - 3));
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        if (!this.ligado || this.rec !== rec) return;
        try {
          rec.start();
        } catch {
          /* já reaberto */
        }
      }, espera);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.parar();
      this.aoFalhar("indisponivel");
    }
  }

  parar() {
    this.ligado = false;
    if (typeof window !== "undefined") window.clearTimeout(this.timer);
    const rec = this.rec;
    this.rec = null;
    try {
      rec?.abort();
    } catch {
      /* já parado */
    }
  }
}
