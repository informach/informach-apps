export function renderBudget(
  width: number,
  height: number,
  ratio: number,
  mode: "preview" | "export" = "preview",
): { ratio: number; width: number; height: number; limited: boolean } {
  if (![width, height, ratio].every(Number.isFinite) || width <= 0 || height <= 0 || ratio <= 0)
    throw new Error("Dimensões de renderização inválidas.");
  const pixels = mode === "preview" ? 16_000_000 : 64_000_000,
    side = mode === "preview" ? 8192 : 16384;
  const effective = Math.min(
    ratio,
    Math.sqrt(pixels / (width * height)),
    side / width,
    side / height,
  );
  if (mode === "export" && effective < ratio * 0.99999)
    throw new Error(
      "A resolução solicitada excede 64 megapixels ou 16384 pixels por lado. Escolha uma resolução menor.",
    );
  return {
    ratio: effective,
    width: Math.max(1, Math.floor(width * effective)),
    height: Math.max(1, Math.floor(height * effective)),
    limited: effective < ratio * 0.99999,
  };
}
