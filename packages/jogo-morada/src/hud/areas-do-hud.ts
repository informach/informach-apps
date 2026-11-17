import type { AreaDaInterface } from "../modelo/rotulos-na-cena";

const PAINEIS = ".morada-painel, .morada-presenca, .morada-menu, .morada-aviso, .morada-faixa";

/** Mede quando o HUD muda; a cena só consulta o cache, sem ler layout por quadro. */
export class AreasDoHud {
  private areas: AreaDaInterface[] = [];
  private observados = new Set<Element>();
  private quadro: number | null = null;
  private encerrado = false;
  private readonly tamanhos = new ResizeObserver(() => this.agendar());
  private readonly estrutura = new MutationObserver((mudancas) => {
    if (
      mudancas.some(
        (m) =>
          m.type === "childList" ||
          (m.target instanceof Element &&
            (m.target === this.hud ||
              m.target.classList.contains("morada-hud") ||
              m.target.matches(PAINEIS))),
      )
    )
      this.agendar();
  });

  constructor(
    private readonly hud: HTMLElement,
    private readonly cena: HTMLElement,
  ) {
    this.tamanhos.observe(cena);
    this.estrutura.observe(hud, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    this.agendar();
  }

  atuais = (): readonly AreaDaInterface[] => this.areas;

  private agendar(): void {
    if (this.encerrado || this.quadro !== null) return;
    this.quadro = requestAnimationFrame(() => {
      this.quadro = null;
      this.medir();
    });
  }

  private medir(): void {
    if (this.encerrado) return;
    const paineis = new Set(this.hud.querySelectorAll(PAINEIS));
    for (const anterior of this.observados)
      if (!paineis.has(anterior)) this.tamanhos.unobserve(anterior);
    for (const painel of paineis) if (!this.observados.has(painel)) this.tamanhos.observe(painel);
    this.observados = paineis;
    const base = this.cena.getBoundingClientRect();
    const areas: AreaDaInterface[] = [];
    for (const painel of paineis) {
      const caixa = painel.getBoundingClientRect();
      if (
        caixa.width <= 0 ||
        caixa.height <= 0 ||
        caixa.right <= base.left ||
        caixa.left >= base.right ||
        caixa.bottom <= base.top ||
        caixa.top >= base.bottom
      )
        continue;
      areas.push({
        x0: caixa.left - base.left,
        y0: caixa.top - base.top,
        x1: caixa.right - base.left,
        y1: caixa.bottom - base.top,
      });
    }
    this.areas = areas;
  }

  dispose(): void {
    this.encerrado = true;
    if (this.quadro !== null) cancelAnimationFrame(this.quadro);
    this.quadro = null;
    this.tamanhos.disconnect();
    this.estrutura.disconnect();
    this.observados.clear();
    this.areas = [];
  }
}
