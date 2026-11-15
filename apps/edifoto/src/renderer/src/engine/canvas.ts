/** A canvas without a 2D context cannot participate in image operations. */
export function requireCanvas2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar o contexto de desenho.");
  return context;
}
