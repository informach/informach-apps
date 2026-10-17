(async () => {
  for (let i = 0; i < 80 && !window.__edifoto; i++) await new Promise((r) => setTimeout(r, 100));
  const E = window.__edifoto;
  const hex = (c) =>
    "#" +
    c
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const B = [0.75, 0.38, 0.19],
    S = [0.25, 0.5, 0.82];
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const clip = (c) => {
    const l = lum(c),
      n = Math.min(...c),
      x = Math.max(...c);
    if (n < 0) c = c.map((v) => l + ((v - l) * l) / (l - n));
    if (x > 1) c = c.map((v) => l + ((v - l) * (1 - l)) / (x - l));
    return c;
  };
  const setLum = (c, l) => clip(c.map((v) => v + (l - lum(c))));
  const sat = (c) => Math.max(...c) - Math.min(...c);
  const setSat = (c, s) => {
    const mx = Math.max(...c),
      mn = Math.min(...c);
    return mx > mn ? c.map((v) => ((v - mn) * s) / (mx - mn)) : [0, 0, 0];
  };
  const burn = (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
  const dodge = (b, s) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
  const hard = (b, s) => (s <= 0.5 ? b * 2 * s : b + (2 * s - 1) - b * (2 * s - 1));
  const soft = (b, s) =>
    s <= 0.5
      ? b - (1 - 2 * s) * b * (1 - b)
      : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
  const per = (f) => (b, s) => b.map((v, i) => f(v, s[i]));
  const sum = (c) => c[0] + c[1] + c[2];
  const ref = {
    normal: (b, s) => s,
    darken: per(Math.min),
    multiply: per((b, s) => b * s),
    colorBurn: per(burn),
    linearBurn: per((b, s) => Math.max(b + s - 1, 0)),
    darkerColor: (b, s) => (sum(s) < sum(b) ? s : b),
    lighten: per(Math.max),
    screen: per((b, s) => b + s - b * s),
    colorDodge: per(dodge),
    linearDodge: per((b, s) => Math.min(b + s, 1)),
    lighterColor: (b, s) => (sum(s) > sum(b) ? s : b),
    overlay: per((b, s) => hard(s, b)),
    softLight: per(soft),
    hardLight: per(hard),
    vividLight: per((b, s) => (s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * (s - 0.5)))),
    linearLight: per((b, s) => Math.min(1, Math.max(0, b + 2 * s - 1))),
    pinLight: per((b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1))),
    hardMix: per((b, s) => (b + s >= 1 ? 1 : 0)),
    difference: per((b, s) => Math.abs(b - s)),
    exclusion: per((b, s) => b + s - 2 * b * s),
    subtract: per((b, s) => Math.max(b - s, 0)),
    divide: per((b, s) => (s <= 0 ? (b > 0 ? 1 : 0) : Math.min(1, b / s))),
    hue: (b, s) => setLum(setSat(s, sat(b)), lum(b)),
    saturation: (b, s) => setLum(setSat(b, sat(s)), lum(b)),
    color: (b, s) => setLum(s, lum(b)),
    luminosity: (b, s) => setLum(b, lum(s)),
  };
  E.useDoc.getState().load({
    id: "d",
    name: "t",
    width: 8,
    height: 8,
    layers: [
      {
        id: "b",
        name: "b",
        visible: true,
        locked: false,
        blendMode: "normal",
        opacity: 1,
        fill: 1,
        kind: "solid",
        color: hex(B),
      },
      {
        id: "s",
        name: "s",
        visible: true,
        locked: false,
        blendMode: "normal",
        opacity: 1,
        fill: 1,
        kind: "solid",
        color: hex(S),
      },
    ],
  });
  const q = (c) => c.map((v) => Math.round(v * 255) / 255);
  const Bq = q(B),
    Sq = q(S);
  const c = E.compositor();
  let worst = 0,
    bad = [];
  for (const mode of Object.keys(ref)) {
    const t = c.composite(E.useDoc.getState().doc, { modeOverride: { layerId: "s", mode } });
    const got = c.sample(t, 3, 3).slice(0, 3);
    const exp = ref[mode](Bq, Sq);
    const err = Math.max(...got.map((v, i) => Math.abs(v - exp[i]))) * 255;
    worst = Math.max(worst, err);
    if (err > 1.5)
      bad.push(
        `${mode}: got ${got.map((v) => (v * 255).toFixed(1))} exp ${exp.map((v) => (v * 255).toFixed(1))}`,
      );
  }
  return { modes: Object.keys(ref).length, worstErrorIn255: worst.toFixed(2), bad };
})();
