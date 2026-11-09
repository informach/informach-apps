/**
 * The ready elements of the screen demonstration recipe: an arrow, a balloon, a highlight and a
 * click mark, drawn in the run's text palette (the main colour and the accent), each an artboard
 * the assistant places as component instances over the video. Plain SVG the importer reads.
 */

export interface ElementSvg {
  name: string;
  svg: string;
}

/** The colours of the elements: the text palette's first (light) and last (accent) colours. */
export function elementSvgs(palette: readonly string[]): ElementSvg[] {
  const light = palette[0] ?? "#ffffff";
  const dark = palette[1] ?? "#1f2a44";
  // The accent is a colour of its own: with one or two colours the last one is the text's, and an
  // arrow in the balloon's colour would disappear on it.
  const accent = (palette.length >= 3 ? palette.at(-1) : undefined) ?? "#ffb547";
  return [
    {
      name: "Seta",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><path d="M10 60 L180 60" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/><path d="M160 20 L230 60 L160 100 Z" fill="${accent}"/></svg>`,
    },
    {
      name: "Balão",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="220" viewBox="0 0 520 220"><path d="M30 10 H490 Q510 10 510 30 V150 Q510 170 490 170 H140 L90 210 L100 170 H30 Q10 170 10 150 V30 Q10 10 30 10 Z" fill="${light}" stroke="${dark}" stroke-width="6"/><text x="260" y="104" font-family="Arial" font-size="40" font-weight="700" fill="${dark}" text-anchor="middle">Clique aqui</text></svg>`,
    },
    {
      name: "Destaque",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect x="8" y="8" width="304" height="184" rx="18" fill="none" stroke="${accent}" stroke-width="10"/></svg>`,
    },
    {
      name: "Clique",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="${accent}" stroke-width="8"/><circle cx="60" cy="60" r="18" fill="${accent}"/></svg>`,
    },
  ];
}
