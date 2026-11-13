import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { type AmbienteEmpacotado, empacotarAmbiente } from "./ambiente";
import {
  alcanceDosOssos,
  BibliotecaDeAnimacao,
  type Caminho,
  type Clipe,
  desvioDasPontas,
  ehCiclo,
  poseNoTempo,
  reduzirClipe,
  TOLERANCIA_PADRAO,
  type Tolerancia,
} from "./animacao/clipes";
import {
  CLIPES_DO_JOGO,
  type Escolha,
  escolherClipes,
  type Faixa,
  faixaDoJogo,
  nomeDaPostura,
  type PedidoDeClipe,
  POSE_DOBRADA,
  POSTURAS,
} from "./animacao/jogo";
import { ErroDeArte, validar } from "./erros";
import { matrizesNoMundo, poseDeDescanso, posicaoDaMatriz } from "./esqueleto";
import { Biblioteca } from "./leitura/biblioteca";
import type { Corpo, Osso } from "./leitura/corpo";
import {
  ARQUIVO_DO_MANIFESTO,
  arquivosDoManifesto,
  type BibliotecaDoManifesto,
  FORMATO_DO_MANIFESTO,
  type Manifesto,
  ManifestoSchema,
  type PersonagemDoManifesto,
  SUFIXO_BROTLI,
  VERSAO_DO_MANIFESTO,
} from "./manifesto";
import { em, item, type Vec3 } from "./numeros";
import type { Personagem } from "./personagem/esquema";
import {
  montarPersonagem,
  OPCOES_PADRAO,
  type OpcoesDeMontagemDoPersonagem,
  ossosDeMao,
  type PersonagemMontado,
} from "./personagem/montagem";
import { escreverBiblioteca } from "./saida/biblioteca";
import { ESCRITA_PADRAO, escreverPersonagem, type OpcoesDeEscrita } from "./saida/glb";

/** O empacotador: da pasta da arte e de uma lista de personagens aos pacotes do jogo e ao manifesto. */

export type OpcoesDoEmpacotador = {
  /** Pasta da cópia do repositório de arte (`ARTES_3D_DIR`). */
  arte: string;
  saida: string;
  personagens: readonly Personagem[];
  /** Planta cujas peças e acabamentos serão incluídos; omitida em pacotes só de personagens. */
  casa?: unknown;
  /** Os clipes que o jogo usa; por omissão, a lista deste pacote. */
  pedidos?: readonly PedidoDeClipe[];
  tolerancia?: Tolerancia;
  montagem?: OpcoesDeMontagemDoPersonagem;
  escrita?: OpcoesDeEscrita;
  /** Commit da arte, quando a pasta não é um clone do git. */
  commit?: string | null;
  aoAvancar?: (mensagem: string) => void;
};

export type Tamanhos = { bytes: number; gzip: number; brotli: number };

export type ResumoDePersonagem = Tamanhos & {
  id: string;
  arquivo: string;
  chamadas: number;
  triangulos: number;
  vertices: number;
  texturas: number;
  ms: number;
  montado: PersonagemMontado;
};

export type ResumoDeClipe = {
  nome: string;
  bytes: number;
  duracao: number;
  chavesAntes: number;
  chavesDepois: number;
  canaisAntes: number;
  canaisDepois: number;
  /** Maior desvio de pés, mãos e cabeça depois da redução, em metros. */
  desvio: number;
  ossoDoDesvio: string;
};

export type ResumoDeBiblioteca = Tamanhos & {
  id: string;
  arquivo: string;
  ms: number;
  clipes: ResumoDeClipe[];
  /** Pedidos do jogo sem clipe nenhum nesta biblioteca. */
  faltas: string[];
  /** Pedidos atendidos por um clipe que não é o gesto pedido. */
  substitutos: { nome: string; clipe: string }[];
};

export type Resultado = {
  manifesto: Manifesto;
  personagens: ResumoDePersonagem[];
  bibliotecas: ResumoDeBiblioteca[];
  ms: number;
  ambiente: AmbienteEmpacotado;
  recursos: (Tamanhos & { arquivo: string })[];
};

/** Brotli na qualidade máxima: os pacotes são comprimidos uma vez e servidos muitas. */
export function brotli(bytes: Uint8Array): Buffer {
  return brotliCompressSync(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  });
}

export function tamanhos(bytes: Uint8Array): Tamanhos {
  return {
    bytes: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotli(bytes).length,
  };
}

/** Nome do arquivo com os dez primeiros dígitos do SHA-256 do conteúdo. */
export function nomeComHash(nome: string, bytes: Uint8Array): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  return `${nome}.${hash}.glb`;
}

const arredondar = (v: Vec3): Vec3 => [
  Math.round(v[0] * 10000) / 10000,
  Math.round(v[1] * 10000) / 10000,
  Math.round(v[2] * 10000) / 10000,
];

/** Um clipe da biblioteca visto no esqueleto do corpo: os canais passam para os ossos de mesmo nome. */
function noEsqueletoDoCorpo(
  clipe: Clipe,
  daBiblioteca: readonly Osso[],
  doCorpo: readonly Osso[],
): Clipe {
  const canais = clipe.canais.flatMap((canal) => {
    const nome = item(daBiblioteca, canal.osso).nome;
    const osso = doCorpo.findIndex((o) => o.nome === nome);
    return osso < 0 ? [] : [{ ...canal, osso }];
  });
  return { ...clipe, canais };
}

function ancoras(
  corpo: Corpo,
  segurar: { clipe: Clipe; ossos: readonly Osso[] } | null,
): PersonagemDoManifesto["ancoras"] {
  const descanso = matrizesNoMundo(corpo.armadura, corpo.ossos, poseDeDescanso(corpo.ossos)).map(
    posicaoDaMatriz,
  );
  const de = (nome: string): Vec3 => {
    const indice = corpo.ossos.findIndex((o) => o.nome === nome);
    if (indice < 0)
      throw new ErroDeArte(corpo.arquivo, `o esqueleto não tem o osso ${nome}`, "skins.0.joints");
    return arredondar(item(descanso, indice));
  };
  const maos = ossosDeMao(corpo);
  let colo: Vec3 = arredondar([0, corpo.altura * 0.62, corpo.altura * 0.17]);
  let coloMedido = false;
  if (segurar) {
    // o bebê fica entre as duas mãos do clipe de segurar, como na página
    const clipe = noEsqueletoDoCorpo(segurar.clipe, segurar.ossos, corpo.ossos);
    const pose = matrizesNoMundo(
      corpo.armadura,
      corpo.ossos,
      poseNoTempo(clipe, corpo.ossos, 0),
    ).map(posicaoDaMatriz);
    const esq = corpo.ossos.findIndex((o) => o.nome === "LeftHand");
    const dir = corpo.ossos.findIndex((o) => o.nome === "RightHand");
    if (esq >= 0 && dir >= 0) {
      const a = item(pose, esq);
      const b = item(pose, dir);
      colo = arredondar([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      coloMedido = true;
    }
  }
  return {
    colo,
    coloMedido,
    cabeca: de("Head"),
    maos: {
      esq: { osso: maos.esq, posicao: de(maos.esq) },
      dir: { osso: maos.dir, posicao: de(maos.dir) },
    },
  };
}

type BibliotecaPronta = {
  manifesto: BibliotecaDoManifesto;
  resumo: ResumoDeBiblioteca;
  /** O clipe de segurar bebê e o esqueleto dele, para medir o colo. */
  segurar: { clipe: Clipe; ossos: readonly Osso[] } | null;
};

async function empacotarBiblioteca(
  biblioteca: Biblioteca,
  id: string,
  faixa: Faixa,
  gravida: boolean,
  pedidos: readonly PedidoDeClipe[],
  tolerancia: Tolerancia,
  saida: string,
): Promise<BibliotecaPronta> {
  const inicio = performance.now();
  const caminho = biblioteca.caminhoDaBibliotecaDeAnimacao(id);
  if (!existsSync(caminho)) {
    throw new ErroDeArte(caminho, `a biblioteca de animação "${id}" não está na pasta da arte`);
  }
  const fonte = new BibliotecaDeAnimacao(caminho);
  try {
    const { esqueleto } = fonte;
    const escolhas: Escolha[] = escolherClipes(pedidos, new Set(esqueleto.clipes), faixa);
    const nomes = [...new Set(escolhas.flatMap((e) => (e.clipe ? [e.clipe] : [])))].sort();

    // Um canal parado no valor de descanso pode sair quando todo corpo que usa esta biblioteca tem o
    // mesmo descanso naquele osso: aí o osso fica onde o esqueleto do personagem o deixa, que é o mesmo
    // lugar. Onde os corpos diferem, a chave fica (a página põe o valor da biblioteca no corpo gêmeo).
    const corposDaBiblioteca = gravida
      ? [id.replace(/_gravida$/, "")]
      : biblioteca.tabelas.CORPOS.filter(
          (c) => (biblioteca.tabelas.GEMEO[c.id] ?? c.id) === id,
        ).map((c) => c.id);
    const iguais = (osso: number, caminhoDoCanal: Caminho): boolean => {
      const daBiblioteca = item(esqueleto.ossos, osso);
      const valor =
        caminhoDoCanal === "rotation"
          ? daBiblioteca.rotacao
          : caminhoDoCanal === "translation"
            ? daBiblioteca.translacao
            : daBiblioteca.escala;
      return corposDaBiblioteca.every((corpoId) => {
        const doCorpo = biblioteca.corpo(corpoId).ossos.find((o) => o.nome === daBiblioteca.nome);
        if (!doCorpo) return false;
        const outro =
          caminhoDoCanal === "rotation"
            ? doCorpo.rotacao
            : caminhoDoCanal === "translation"
              ? doCorpo.translacao
              : doCorpo.escala;
        return valor.every((x, k) => Math.abs(x - em(outro, k)) <= 1e-5);
      });
    };
    const cacheDeIguais = new Map<string, boolean>();
    const descartavel = (osso: number, caminhoDoCanal: Caminho): boolean => {
      if (caminhoDoCanal === "rotation") return false;
      const chave = `${osso}.${caminhoDoCanal}`;
      let valor = cacheDeIguais.get(chave);
      if (valor === undefined) {
        valor = iguais(osso, caminhoDoCanal);
        cacheDeIguais.set(chave, valor);
      }
      return valor;
    };

    const alcances = alcanceDosOssos(esqueleto.armadura, esqueleto.ossos);
    const vazio = (await escreverBiblioteca(esqueleto, [])).length;
    const clipes: Clipe[] = [];
    const resumos: ResumoDeClipe[] = [];
    const doManifesto: BibliotecaDoManifesto["clipes"] = [];
    let segurar: BibliotecaPronta["segurar"] = null;
    const apoios = biblioteca.info.apoios[id] ?? {};
    for (const nome of nomes) {
      const original = fonte.ler(nome);
      const reduzido = reduzirClipe(original, esqueleto.ossos, tolerancia, descartavel, alcances);
      const desvio = desvioDasPontas(original, reduzido.clipe, esqueleto.armadura, esqueleto.ossos);
      const sozinho = (await escreverBiblioteca(esqueleto, [reduzido.clipe])).length - vazio;
      clipes.push(reduzido.clipe);
      resumos.push({
        nome,
        bytes: sozinho,
        duracao: original.duracao,
        chavesAntes: reduzido.chavesAntes,
        chavesDepois: reduzido.chavesDepois,
        canaisAntes: reduzido.canaisAntes,
        canaisDepois: reduzido.clipe.canais.length,
        desvio: desvio.maximo,
        ossoDoDesvio: desvio.osso,
      });
      doManifesto.push({
        nome,
        duracao: Math.round(original.duracao * 10000) / 10000,
        ciclo: ehCiclo(original),
        deslocamento: nome.endsWith(".rm"),
        dobrada: POSE_DOBRADA.test(nome),
        apoio: apoios[nome] ?? null,
      });
      if (nome === "resident.care.hold_idle") segurar = { clipe: original, ossos: esqueleto.ossos };
    }
    const glb = await escreverBiblioteca(esqueleto, clipes);
    const arquivo = nomeComHash(`anim-${id}`, glb);
    writeFileSync(join(saida, arquivo), glb);
    const posturas: Record<string, string | null> = {};
    for (const postura of POSTURAS) {
      const escolha = escolhas.find((e) => e.nome === nomeDaPostura(postura));
      posturas[postura] = escolha?.clipe ?? null;
    }
    const interacoes: BibliotecaDoManifesto["interacoes"] = {};
    for (const escolha of escolhas) {
      if (escolha.nome.startsWith("postura.")) continue;
      interacoes[escolha.nome] = { clipe: escolha.clipe, substituto: escolha.substituto };
    }
    return {
      manifesto: {
        id,
        arquivo,
        bytes: glb.length,
        faixa,
        gravida,
        clipes: doManifesto,
        posturas,
        interacoes,
      },
      resumo: {
        id,
        arquivo,
        ...tamanhos(glb),
        ms: performance.now() - inicio,
        clipes: resumos,
        faltas: escolhas.filter((e) => !e.clipe).map((e) => e.nome),
        substitutos: escolhas.flatMap((e) =>
          e.clipe && e.substituto ? [{ nome: e.nome, clipe: e.clipe }] : [],
        ),
      },
      segurar,
    };
  } finally {
    fonte.fechar();
  }
}

export async function empacotar(opcoes: OpcoesDoEmpacotador): Promise<Resultado> {
  const inicio = performance.now();
  const avisar = opcoes.aoAvancar ?? (() => {});
  const biblioteca = new Biblioteca(opcoes.arte);
  const pedidos = opcoes.pedidos ?? CLIPES_DO_JOGO;
  const tolerancia = opcoes.tolerancia ?? TOLERANCIA_PADRAO;
  const ids = opcoes.personagens.map((p) => p.id);
  const repetido = ids.find((id, k) => ids.indexOf(id) !== k);
  if (repetido)
    throw new ErroDeArte("elenco", `o personagem "${repetido}" aparece duas vezes`, "id");
  if (opcoes.personagens.length === 0)
    throw new ErroDeArte("elenco", "nenhum personagem para empacotar");
  mkdirSync(opcoes.saida, { recursive: true });

  // ---------------------------------------------------------------- personagens
  const montados: { personagem: Personagem; montado: PersonagemMontado; ms: number }[] = [];
  for (const personagem of opcoes.personagens) {
    const t0 = performance.now();
    avisar(`montando ${personagem.id} (${personagem.corpo})`);
    const montado = montarPersonagem(biblioteca, personagem, opcoes.montagem ?? OPCOES_PADRAO);
    montados.push({ personagem, montado, ms: performance.now() - t0 });
  }

  // ---------------------------------------------------------------- bibliotecas de animação
  const necessarias = new Map<string, { faixa: Faixa; gravida: boolean }>();
  for (const { montado } of montados) {
    const { plano } = montado;
    const faixa = faixaDoJogo(plano.faixa);
    if (!plano.biblioteca || !faixa) continue;
    necessarias.set(plano.biblioteca, { faixa, gravida: false });
    if (plano.engravida)
      necessarias.set(`${plano.personagem.corpo}_gravida`, { faixa, gravida: true });
  }
  const bibliotecas = new Map<string, BibliotecaPronta>();
  for (const [id, { faixa, gravida }] of [...necessarias].sort(([a], [b]) => a.localeCompare(b))) {
    avisar(`biblioteca de animação ${id}`);
    bibliotecas.set(
      id,
      await empacotarBiblioteca(biblioteca, id, faixa, gravida, pedidos, tolerancia, opcoes.saida),
    );
  }

  // ---------------------------------------------------------------- escrita dos personagens
  const personagens: ResumoDePersonagem[] = [];
  const doManifesto: PersonagemDoManifesto[] = [];
  for (const { personagem, montado, ms } of montados) {
    const t0 = performance.now();
    avisar(`escrevendo ${personagem.id}`);
    const escrito = await escreverPersonagem(montado, opcoes.escrita ?? ESCRITA_PADRAO);
    const arquivo = nomeComHash(personagem.id, escrito.glb);
    writeFileSync(join(opcoes.saida, arquivo), escrito.glb);
    const { plano, corpo } = montado;
    const texturas = montado.primitivas.filter((p) => p.textura).length;
    const doCorpo = escrito.malhas.find((m) => m.no === "corpo");
    const neutro = escrito.malhas.find((m) => m.no.startsWith("rosto_"));
    const daChupeta = escrito.malhas.find((m) => m.no === "chupeta");
    const desenho = {
      chamadas: (doCorpo?.primitivas ?? 0) + 1 + (daChupeta ? 1 : 0),
      triangulos:
        (doCorpo?.triangulos ?? 0) + (neutro?.triangulos ?? 0) + (daChupeta?.triangulos ?? 0),
      vertices: (doCorpo?.vertices ?? 0) + (neutro?.vertices ?? 0) + (daChupeta?.vertices ?? 0),
      texturas,
    };
    const daGravida = `${personagem.corpo}_gravida`;
    doManifesto.push({
      id: personagem.id,
      nome: personagem.nome,
      arquivo,
      bytes: escrito.glb.length,
      corpo: personagem.corpo,
      sexo: plano.sexo,
      faixa: plano.faixa,
      altura: Math.round(corpo.altura * 10000) / 10000,
      biblioteca: plano.biblioteca,
      bibliotecaDeGravida: plano.engravida && bibliotecas.has(daGravida) ? daGravida : null,
      noDoCorpo: "corpo",
      noDaChupeta: daChupeta ? "chupeta" : null,
      expressoes: montado.rostos.map((r) => ({
        nome: r.expressao,
        no: `rosto_${r.expressao}`,
        fala: r.primitiva.formas.map((f) => f.nome),
      })),
      gravidez: montado.gravidez,
      pesosDobrado: montado.dobrado,
      ancoras: ancoras(
        corpo,
        plano.biblioteca ? (bibliotecas.get(plano.biblioteca)?.segurar ?? null) : null,
      ),
      desenho,
      sim: personagem.sim ?? null,
    });
    personagens.push({
      id: personagem.id,
      arquivo,
      ...tamanhos(escrito.glb),
      ...desenho,
      ms: ms + (performance.now() - t0),
      montado,
    });
  }

  const ambiente =
    opcoes.casa === undefined
      ? { objetos: [], acabamentos: [], aberturas: [] }
      : await empacotarAmbiente(opcoes.arte, opcoes.saida, opcoes.casa);
  const manifesto = validar(
    ManifestoSchema,
    {
      formato: FORMATO_DO_MANIFESTO,
      versao: VERSAO_DO_MANIFESTO,
      arte: {
        repositorio: "informach/artes-3d",
        commit: opcoes.commit === undefined ? biblioteca.commit() : opcoes.commit,
      },
      personagens: doManifesto,
      bibliotecas: [...bibliotecas.values()].map((b) => b.manifesto),
      ...ambiente,
    } satisfies Manifesto,
    "manifest.json",
  );
  // Sem espaços: formatado, o manifesto da prova passava de 780 kB; assim fica em cerca de 160 kB.
  const textoDoManifesto = new TextEncoder().encode(`${JSON.stringify(manifesto)}\n`);
  writeFileSync(join(opcoes.saida, ARQUIVO_DO_MANIFESTO), textoDoManifesto);

  // Cada arquivo ganha uma cópia em brotli (`<arquivo>.br`), que o servidor do jogo entrega a quem
  // aceita. Comprimir uma vez aqui sai mais barato do que a cada pedido.
  const atuais = new Set(arquivosDoManifesto(manifesto));
  const recursos: Resultado["recursos"] = [];
  for (const nome of arquivosDoManifesto(manifesto)) {
    const caminho = join(opcoes.saida, nome);
    const original = readFileSync(caminho);
    const comprimido = brotli(original);
    writeFileSync(`${caminho}${SUFIXO_BROTLI}`, comprimido);
    recursos.push({
      arquivo: nome,
      bytes: original.length,
      gzip: gzipSync(original, { level: 9 }).length,
      brotli: comprimido.length,
    });
  }

  // os pacotes de uma rodada anterior que não fazem mais parte do manifesto saem da pasta
  for (const nome of readdirSync(opcoes.saida)) {
    const pacote = /^([a-z0-9_-]+\.[0-9a-f]{10}\.(?:glb|png))(\.br)?$/.exec(nome);
    if (pacote?.[1] && !atuais.has(pacote[1])) rmSync(join(opcoes.saida, nome));
  }

  return {
    manifesto,
    personagens,
    bibliotecas: [...bibliotecas.values()].map((b) => b.resumo),
    ms: performance.now() - inicio,
    ambiente,
    recursos,
  };
}
