import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ErroDeArte } from "../erros";
import {
  type CatalogoDeCabelos,
  type CatalogoDeRoupas,
  ElencoSchema,
  type Info,
  InfoSchema,
  lerArquivoJson,
  lerCabelos,
  lerRoupas,
  type Mascaras,
  MascarasSchema,
  type PersonagemDoElenco,
  type Rotulos,
  RotulosSchema,
} from "./catalogos";
import { type Corpo, lerCorpo } from "./corpo";
import { type Imagem, lerPng } from "./imagem";
import { type Item, lerItem } from "./item";
import { lerTabelasDaPagina, type TabelasDaPagina } from "./pagina";
import { type Familia, lerFamilias, lerPeles, type Pele } from "./tabelas";

/**
 * A biblioteca de personagens dentro de uma cópia do repositório de arte
 * (`ARTES_3D_DIR`). Tudo é lido daqui em tempo de execução, na primeira vez
 * que é pedido; nada da arte fica no código.
 *
 * Onde cada coisa está:
 * - `biblioteca/corpos/<corpo>.glb`, `biblioteca/itens/<id>.txt`, `familias.txt`, `peles.txt`;
 * - `codigo/arte/roupas.json`, `cabelos.json`, `elenco.json` (os catálogos);
 * - `biblioteca/roupas_mascaras/` (máscaras de cor livre e `mascaras.json`);
 * - `biblioteca/roupas_gen/<material>.png` (texturas das peças geradas) e
 *   `paginas/tipos_de_corpo/roupas/<material>.png` (paletas dos pacotes de origem);
 * - `paginas/tipos_de_corpo/corpos/paleta.png` (a paleta dos corpos) e `corpos.html` (tabelas de corpos e cores);
 * - `biblioteca/bibliotecas_30fps/<esqueleto>.glb`, `biblioteca/info.json`, `biblioteca/rotulos.json`.
 */
export class Biblioteca {
  readonly raiz: string;
  private readonly corpos = new Map<string, Corpo>();
  private readonly itens = new Map<string, Item>();
  private readonly imagens = new Map<string, Imagem>();
  private familiasLidas: Map<string, Familia> | null = null;
  private pelesLidas: Map<string, Pele> | null = null;
  private roupasLidas: CatalogoDeRoupas | null = null;
  private cabelosLidos: CatalogoDeCabelos | null = null;
  private mascarasLidas: Mascaras | null = null;
  private elencoLido: Map<string, PersonagemDoElenco> | null = null;
  private infoLida: Info | null = null;
  private rotulosLidos: Rotulos | null = null;
  private tabelasLidas: TabelasDaPagina | null = null;

  constructor(raiz: string) {
    if (!existsSync(raiz) || !statSync(raiz).isDirectory()) {
      throw new ErroDeArte(raiz, "a pasta da arte não existe (ARTES_3D_DIR ou --arte)");
    }
    for (const pasta of ["biblioteca/corpos", "biblioteca/itens"]) {
      if (!existsSync(join(raiz, pasta))) {
        throw new ErroDeArte(
          join(raiz, pasta),
          "pasta não encontrada: esta é mesmo a cópia do repositório de arte?",
        );
      }
    }
    this.raiz = raiz;
  }

  caminho(...partes: string[]): string {
    return join(this.raiz, ...partes);
  }

  corpo(id: string): Corpo {
    let corpo = this.corpos.get(id);
    if (!corpo) {
      const caminho = this.caminho("biblioteca", "corpos", `${id}.glb`);
      if (!existsSync(caminho))
        throw new ErroDeArte(caminho, `o corpo "${id}" não existe na biblioteca`);
      corpo = lerCorpo(caminho, id);
      this.corpos.set(id, corpo);
    }
    return corpo;
  }

  item(id: string): Item {
    let item = this.itens.get(id);
    if (!item) {
      if (!/^[a-z0-9_]+$/.test(id)) {
        throw new ErroDeArte(this.caminho("biblioteca", "itens"), `"${id}" não é um id de item`);
      }
      item = lerItem(this.caminho("biblioteca", "itens", `${id}.txt`));
      this.itens.set(id, item);
    }
    return item;
  }

  temItem(id: string): boolean {
    return /^[a-z0-9_]+$/.test(id) && existsSync(this.caminho("biblioteca", "itens", `${id}.txt`));
  }

  get familias(): Map<string, Familia> {
    this.familiasLidas ??= lerFamilias(this.caminho("biblioteca", "itens", "familias.txt"));
    return this.familiasLidas;
  }

  get peles(): Map<string, Pele> {
    this.pelesLidas ??= lerPeles(this.caminho("biblioteca", "itens", "peles.txt"));
    return this.pelesLidas;
  }

  get roupas(): CatalogoDeRoupas {
    this.roupasLidas ??= lerRoupas(this.caminho("codigo", "arte", "roupas.json"));
    return this.roupasLidas;
  }

  get cabelos(): CatalogoDeCabelos {
    this.cabelosLidos ??= lerCabelos(this.caminho("codigo", "arte", "cabelos.json"));
    return this.cabelosLidos;
  }

  get mascaras(): Mascaras {
    this.mascarasLidas ??= lerArquivoJson(
      this.caminho("biblioteca", "roupas_mascaras", "mascaras.json"),
      MascarasSchema,
    );
    return this.mascarasLidas;
  }

  get elenco(): Map<string, PersonagemDoElenco> {
    if (!this.elencoLido) {
      const lido = lerArquivoJson(this.caminho("codigo", "arte", "elenco.json"), ElencoSchema);
      this.elencoLido = new Map(lido.personagens.map((p) => [p.id, p] as const));
    }
    return this.elencoLido;
  }

  get info(): Info {
    this.infoLida ??= lerArquivoJson(this.caminho("biblioteca", "info.json"), InfoSchema);
    return this.infoLida;
  }

  get rotulos(): Rotulos {
    this.rotulosLidos ??= lerArquivoJson(this.caminho("biblioteca", "rotulos.json"), RotulosSchema);
    return this.rotulosLidos;
  }

  /** Corpos, tons, cores com nome e bibliotecas divididas: as tabelas da página de referência. */
  get tabelas(): TabelasDaPagina {
    this.tabelasLidas ??= lerTabelasDaPagina(
      this.caminho("paginas", "tipos_de_corpo", "corpos.html"),
    );
    return this.tabelasLidas;
  }

  private imagem(caminho: string): Imagem {
    let imagem = this.imagens.get(caminho);
    if (!imagem) {
      imagem = lerPng(caminho);
      this.imagens.set(caminho, imagem);
    }
    return imagem;
  }

  /** A paleta que a página põe em todos os materiais do corpo. */
  paletaDoCorpo(): Imagem {
    return this.imagem(this.caminho("paginas", "tipos_de_corpo", "corpos", "paleta.png"));
  }

  /** A textura de um material de roupa (`Roupa_<pacote>_<textura>` ou `Roupa_Gen_<padrão>`). */
  texturaDeRoupa(material: string): Imagem {
    if (!/^Roupa_[A-Za-z0-9_]+$/.test(material)) {
      throw new ErroDeArte(this.raiz, `"${material}" não é um material de roupa`);
    }
    const gerada = this.caminho("biblioteca", "roupas_gen", `${material}.png`);
    if (existsSync(gerada)) return this.imagem(gerada);
    return this.imagem(this.caminho("paginas", "tipos_de_corpo", "roupas", `${material}.png`));
  }

  mascara(arquivo: string): Imagem {
    if (!/^[A-Za-z0-9_.]+\.png$/.test(arquivo)) {
      throw new ErroDeArte(this.raiz, `"${arquivo}" não é um arquivo de máscara`);
    }
    return this.imagem(this.caminho("biblioteca", "roupas_mascaras", arquivo));
  }

  caminhoDaBibliotecaDeAnimacao(esqueleto: string): string {
    return this.caminho("biblioteca", "bibliotecas_30fps", `${esqueleto}.glb`);
  }

  /**
   * O commit da cópia da arte, lido de `.git` sem rodar o git: `HEAD` solto traz o
   * próprio hash; `HEAD` num ramo aponta para o arquivo da referência.
   */
  commit(): string | null {
    const cabeca = this.caminho(".git", "HEAD");
    if (!existsSync(cabeca)) return null;
    const texto = readFileSync(cabeca, "utf8").trim();
    if (/^[0-9a-f]{40}$/.test(texto)) return texto;
    const ref = texto.match(/^ref: (refs\/[A-Za-z0-9_./-]+)$/)?.[1];
    if (!ref || ref.includes("..")) return null;
    const solta = this.caminho(".git", ref);
    if (existsSync(solta)) {
      const hash = readFileSync(solta, "utf8").trim();
      return /^[0-9a-f]{40}$/.test(hash) ? hash : null;
    }
    const empacotadas = this.caminho(".git", "packed-refs");
    if (!existsSync(empacotadas)) return null;
    for (const linha of readFileSync(empacotadas, "utf8").split("\n")) {
      const [hash, nome] = linha.trim().split(" ");
      if (nome === ref && hash && /^[0-9a-f]{40}$/.test(hash)) return hash;
    }
    return null;
  }
}
