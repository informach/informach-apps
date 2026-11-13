import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { empacotar, type Resultado } from "./empacotar";
import { ErroDeArte, lerJson, validar } from "./erros";
import { Biblioteca } from "./leitura/biblioteca";
import { ElencoDeEntradaSchema, type Personagem } from "./personagem/esquema";
import { ELENCO_DA_PROVA } from "./personagem/prova";
import { personagemDoElenco } from "./personagem/resolucao";

/**
 * Linha de comando do empacotador de arte.
 *
 *   tsx src/cli.ts --arte <ARTES_3D_DIR> --saida <pasta> [--prova | --elenco <ids> | --personagens <arquivo.json>]
 *
 * `--arte` pode vir da variável de ambiente `ARTES_3D_DIR`. Sem escolher o
 * elenco, vale `--prova`. Sai com código diferente de zero em qualquer falha
 * de leitura ou de validação.
 */

const USO = `uso: tsx src/cli.ts --arte <ARTES_3D_DIR> --saida <pasta> [opções]

  --arte <pasta>           cópia do repositório de arte (ou a variável ARTES_3D_DIR)
  --saida <pasta>          onde gravar os pacotes e o manifest.json
  --prova                  o elenco da prova (o padrão)
  --elenco <id,id,...>     personagens prontos de codigo/arte/elenco.json
  --personagens <arquivo>  descrições de personagens em JSON (formato "morada-elenco")
  --commit <hash>          commit da arte, quando a pasta não é um clone do git
  --casa <arquivo>         modelo de imóvel do jogo: inclui seus móveis, acabamentos e encaixes
  --ajuda                  mostra este texto
`;

type Argumentos = {
  arte: string | null;
  saida: string | null;
  prova: boolean;
  elenco: string[];
  personagens: string | null;
  commit: string | null;
  ajuda: boolean;
  casa: string | null;
};

export function lerArgumentos(argv: readonly string[], ambiente: NodeJS.ProcessEnv): Argumentos {
  const args: Argumentos = {
    arte: ambiente.ARTES_3D_DIR ?? null,
    saida: null,
    prova: false,
    elenco: [],
    personagens: null,
    commit: null,
    ajuda: false,
    casa: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const opcao = argv[i];
    const valor = (): string => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new ErroDeArte("linha de comando", "falta o valor", opcao);
      return v;
    };
    // `pnpm --filter … empacotar -- --saida x` repassa o `--` separador: não é uma opção.
    if (opcao === "--") continue;
    if (opcao === "--arte") args.arte = valor();
    else if (opcao === "--saida") args.saida = valor();
    else if (opcao === "--prova") args.prova = true;
    else if (opcao === "--elenco") args.elenco.push(...valor().split(",").filter(Boolean));
    else if (opcao === "--personagens") args.personagens = valor();
    else if (opcao === "--commit") args.commit = valor();
    else if (opcao === "--casa") args.casa = valor();
    else if (opcao === "--ajuda" || opcao === "--help" || opcao === "-h") args.ajuda = true;
    else throw new ErroDeArte("linha de comando", "opção desconhecida", opcao);
  }
  return args;
}

function personagensPedidos(args: Argumentos, arte: string, base: string): Personagem[] {
  const lista: Personagem[] = [];
  if (args.personagens) {
    const caminho = resolve(base, args.personagens);
    let texto: string;
    try {
      texto = readFileSync(caminho, "utf8");
    } catch {
      throw new ErroDeArte(caminho, "arquivo não encontrado");
    }
    lista.push(...validar(ElencoDeEntradaSchema, lerJson(texto, caminho), caminho).personagens);
  }
  if (args.elenco.length > 0) {
    const elenco = new Biblioteca(arte).elenco;
    for (const id of args.elenco) {
      const entrada = elenco.get(id);
      if (!entrada)
        throw new ErroDeArte(
          "codigo/arte/elenco.json",
          `não há personagem "${id}" no elenco`,
          "personagens",
        );
      lista.push(personagemDoElenco(entrada));
    }
  }
  if (args.prova || lista.length === 0) lista.unshift(...ELENCO_DA_PROVA);
  return lista;
}

/** A raiz do repositório do código (este arquivo fica em `packages/morada-arte/src`). */
const RAIZ_DO_REPOSITORIO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Se a pasta fica dentro do repositório do código. */
export function dentroDoRepositorio(pasta: string, raiz = RAIZ_DO_REPOSITORIO): boolean {
  const caminho = relative(raiz, resolve(pasta));
  return caminho === "" || (!caminho.startsWith("..") && !isAbsolute(caminho));
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)}`.padStart(8);

export function tabela(resultado: Resultado): string {
  const linhas: string[] = [];
  linhas.push(
    "personagem        arquivo                              kB     gzip   brotli  chamadas  triângulos  vértices    ms",
  );
  let total = { bytes: 0, gzip: 0, brotli: 0 };
  for (const p of resultado.personagens) {
    linhas.push(
      `${p.id.padEnd(17)} ${p.arquivo.padEnd(30)} ${kb(p.bytes)} ${kb(p.gzip)} ${kb(p.brotli)} ${String(p.chamadas).padStart(9)} ${String(p.triangulos).padStart(11)} ${String(p.vertices).padStart(9)} ${p.ms.toFixed(0).padStart(5)}`,
    );
    total = {
      bytes: total.bytes + p.bytes,
      gzip: total.gzip + p.gzip,
      brotli: total.brotli + p.brotli,
    };
  }
  linhas.push("");
  linhas.push(
    "biblioteca        arquivo                              kB     gzip   brotli    clipes    chaves (antes → depois)  desvio máx.    ms",
  );
  for (const b of resultado.bibliotecas) {
    const antes = b.clipes.reduce((s, c) => s + c.chavesAntes, 0);
    const depois = b.clipes.reduce((s, c) => s + c.chavesDepois, 0);
    const desvio = Math.max(0, ...b.clipes.map((c) => c.desvio));
    linhas.push(
      `${b.id.padEnd(17)} ${b.arquivo.padEnd(30)} ${kb(b.bytes)} ${kb(b.gzip)} ${kb(b.brotli)} ${String(b.clipes.length).padStart(9)}    ${`${antes} → ${depois}`.padEnd(24)} ${(desvio * 1000).toFixed(1).padStart(6)} mm ${b.ms.toFixed(0).padStart(6)}`,
    );
    total = {
      bytes: total.bytes + b.bytes,
      gzip: total.gzip + b.gzip,
      brotli: total.brotli + b.brotli,
    };
  }
  linhas.push("");
  linhas.push("ambiente          arquivo                              kB     gzip   brotli");
  for (const p of [
    ...resultado.ambiente.objetos,
    ...resultado.ambiente.aberturas,
    ...resultado.ambiente.acabamentos,
  ]) {
    const resumo = resultado.recursos.find((x) => x.arquivo === p.arquivo);
    linhas.push(
      `${p.id.padEnd(17)} ${p.arquivo} ${kb(p.bytes)} ${kb(resumo?.gzip ?? 0)} ${kb(resumo?.brotli ?? 0)}`,
    );
    total.bytes += p.bytes;
    total.gzip += resumo?.gzip ?? 0;
    total.brotli += resumo?.brotli ?? 0;
  }
  linhas.push("");
  linhas.push(
    `total                                            ${kb(total.bytes)} ${kb(total.gzip)} ${kb(total.brotli)}   (${(total.bytes / 1048576).toFixed(2)} MB; ${(resultado.ms / 1000).toFixed(1)} s)`,
  );
  for (const b of resultado.bibliotecas) {
    if (b.faltas.length > 0) linhas.push(`\n${b.id}: sem clipe para ${b.faltas.join(", ")}`);
    if (b.substitutos.length > 0) {
      linhas.push(
        `${b.id}: substitutos: ${b.substitutos.map((s) => `${s.nome} → ${s.clipe}`).join("; ")}`,
      );
    }
  }
  return linhas.join("\n");
}

export async function executar(
  argv: readonly string[],
  ambiente: NodeJS.ProcessEnv,
): Promise<number> {
  try {
    const args = lerArgumentos(argv, ambiente);
    if (args.ajuda) {
      process.stdout.write(USO);
      return 0;
    }
    if (!args.arte)
      throw new ErroDeArte(
        "linha de comando",
        "diga onde está a arte (--arte ou ARTES_3D_DIR)",
        "--arte",
      );
    if (!args.saida)
      throw new ErroDeArte("linha de comando", "diga onde gravar os pacotes", "--saida");
    // `pnpm --filter` roda o script na pasta do pacote: caminhos relativos valem a partir de
    // onde a pessoa chamou o comando.
    const base = ambiente.INIT_CWD ?? process.cwd();
    const arte = resolve(base, args.arte);
    const saida = resolve(base, args.saida);
    for (const [opcao, pasta] of [
      ["--arte", arte],
      ["--saida", saida],
    ] as const) {
      if (dentroDoRepositorio(pasta)) {
        throw new ErroDeArte(
          "linha de comando",
          "a arte e os pacotes nunca ficam dentro deste repositório, que é público; use uma pasta de fora",
          opcao,
        );
      }
    }
    const resultado = await empacotar({
      arte,
      saida,
      personagens: personagensPedidos(args, arte, base),
      ...(args.casa
        ? { casa: lerJson(readFileSync(resolve(base, args.casa), "utf8"), args.casa) }
        : {}),
      ...(args.commit ? { commit: args.commit } : {}),
      aoAvancar: (mensagem) => process.stderr.write(`${mensagem}\n`),
    });
    process.stdout.write(`${tabela(resultado)}\n`);
    return 0;
  } catch (erro) {
    if (erro instanceof ErroDeArte) process.stderr.write(`erro: ${erro.message}\n`);
    else if (erro instanceof ZodError) process.stderr.write(`erro de validação: ${erro.message}\n`);
    else
      process.stderr.write(
        `erro inesperado: ${erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}\n`,
      );
    return 1;
  }
}

const chamadoDireto = process.argv[1] !== undefined && /cli\.(ts|js)$/.test(process.argv[1]);
if (chamadoDireto) {
  executar(process.argv.slice(2), process.env).then((codigo) => {
    process.exitCode = codigo;
  });
}
