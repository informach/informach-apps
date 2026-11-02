/**
 * Contagem pela voz no modo manual: a pessoa diz os números ("um, dois, três…") e o app conta.
 * Usa o reconhecimento de voz do navegador (Web Speech API). No Chrome o áudio é processado pelo
 * Google e no Safari pela Apple, só enquanto o microfone está ligado; o app não grava nem guarda o
 * áudio. Por isso a primeira ativação pede consentimento (player) e a política de privacidade avisa.
 */

const UNIDADES: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
};
const DE_DEZ: Record<string, number> = {
  dez: 10,
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

/** Os números ditos num trecho, em ordem: por extenso ("vinte e um") ou em algarismos ("21"). */
export function numerosDitos(texto: string): number[] {
  const palavras = normalizar(texto).split(" ").filter(Boolean);
  const numeros: number[] = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i] ?? "";
    if (/^\d{1,3}$/.test(p)) {
      numeros.push(Number(p));
      continue;
    }
    const unidade = UNIDADES[p];
    const deDez = DE_DEZ[p];
    const dezena = DEZENAS[p];
    if (unidade !== undefined) numeros.push(unidade);
    else if (deDez !== undefined) numeros.push(deDez);
    else if (dezena !== undefined) {
      const seguinte = UNIDADES[palavras[i + 2] ?? ""];
      if (palavras[i + 1] === "e" && seguinte !== undefined) {
        numeros.push(dezena + seguinte);
        i += 2;
      } else numeros.push(dezena);
    }
  }
  return numeros;
}

/** O maior salto aceito de uma vez: além disso, é mais provável erro de reconhecimento. */
export const SALTO_MAXIMO = 3;

/**
 * A contagem depois de ouvir `ditos`, partindo de `atual`. Só avança: um número igual ou menor
 * (repetição, eco) é ignorado, e um salto maior que SALTO_MAXIMO também. Assim um número perdido
 * pelo reconhecimento não atrasa a contagem: dizer "sete" com 5 contadas leva a 7.
 */
export function contagemPelaVoz(atual: number, ditos: number[]): number {
  let contagem = atual;
  for (const n of ditos) if (n > contagem && n - contagem <= SALTO_MAXIMO) contagem = n;
  return contagem;
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

export type FalhaVoz = "negado" | "sem-rede" | "indisponivel";

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

  constructor(
    private readonly aoOuvir: (novos: number[], texto: string) => void,
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
        const numeros = numerosDitos(texto);
        const ja = this.entregues.get(i) ?? 0;
        this.entregues.set(i, Math.max(ja, numeros.length));
        this.aoOuvir(numeros.slice(ja), texto);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.parar();
        this.aoFalhar("negado");
      } else if (e.error === "network") {
        this.parar();
        this.aoFalhar("sem-rede");
      }
      // "no-speech" e "aborted" só encerram a rodada; onend reabre
    };
    rec.onend = () => {
      // a rodada seguinte numera os trechos de novo a partir de zero
      this.entregues.clear();
      if (this.ligado && this.rec === rec)
        try {
          rec.start();
        } catch {
          /* já reaberto */
        }
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
    const rec = this.rec;
    this.rec = null;
    try {
      rec?.abort();
    } catch {
      /* já parado */
    }
  }
}
