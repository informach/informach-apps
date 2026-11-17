export class ErroDePrograma extends Error {
  constructor() {
    super("Não foi possível ligar um programa do desenho.");
    this.name = "ErroDePrograma";
  }
}

type Programa = { readonly program: unknown };

/** A admissão só é memorizada após uma ligação válida; falhas nunca viram prontidão. */
export class ProgramasDaCena {
  private readonly admitidos = new WeakSet<Programa>();

  constructor(private readonly estaLigado: (programa: unknown) => boolean) {}

  verificar(programas: readonly Programa[] | null): void {
    for (const programa of programas ?? []) {
      if (this.admitidos.has(programa)) continue;
      if (this.estaLigado(programa.program) !== true) throw new ErroDePrograma();
      this.admitidos.add(programa);
    }
  }
}
