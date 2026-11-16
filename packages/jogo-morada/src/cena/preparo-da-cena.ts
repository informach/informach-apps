/** Uma preparação em curso; alterações intermediárias viram somente a próxima. */
export class PreparoDaCena {
  private atual = Symbol();
  private preparada: symbol | null = null;
  private emCurso: symbol | null = null;
  private falhou = false;
  private descartado = false;

  constructor(
    private readonly compilar: () => Promise<unknown>,
    private readonly aoFalhar: (erro: unknown) => void,
  ) {}

  invalidar(): void {
    if (this.descartado) return;
    this.atual = Symbol();
    this.falhou = false;
  }

  pronta(): boolean {
    if (this.descartado || this.falhou) return false;
    if (this.preparada === this.atual) return true;
    if (this.emCurso !== null) return false;
    const tentativa = this.atual;
    this.emCurso = tentativa;
    void Promise.resolve()
      .then(() => {
        if (this.descartado || this.atual !== tentativa) return;
        return this.compilar();
      })
      .then(
        () => {
          if (!this.descartado && this.atual === tentativa) this.preparada = tentativa;
        },
        (erro: unknown) => {
          if (!this.descartado && this.atual === tentativa) {
            this.falhou = true;
            this.aoFalhar(erro);
          }
        },
      )
      .finally(() => {
        if (this.emCurso === tentativa) this.emCurso = null;
      });
    return false;
  }

  dispose(): void {
    this.descartado = true;
  }
}
