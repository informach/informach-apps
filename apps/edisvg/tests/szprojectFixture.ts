/** A small game of the studio, shaped like "A Chave do Farol", for the import and pipeline tests. */
const svg = (body: string, w: number, h: number) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  ).toString("base64")}`;

export const game = {
  formatVersion: 2,
  id: "manifest-teste",
  name: "A Chave do Farol",
  mode: "blocks",
  files: { "script.js": "SZGame2D.onStart(() => { throw new Error('never run'); });" },
  assets: [
    {
      id: "a-praia",
      name: "praia-tropical",
      kind: "image",
      source: "library",
      dataUrl: svg('<rect width="480" height="360" fill="#00ff00"/>', 480, 360),
      width: 480,
      height: 360,
    },
    {
      id: "a-heroi",
      name: "aventureiro",
      kind: "image",
      source: "library",
      dataUrl: svg('<rect width="64" height="64" fill="#ff0000"/>', 64, 64),
      width: 64,
      height: 64,
    },
    {
      id: "a-extra",
      name: "pirata",
      kind: "image",
      source: "library",
      dataUrl: svg('<circle cx="32" cy="32" r="30" fill="#000"/>', 64, 64),
      width: 64,
      height: 64,
    },
    {
      id: "a-foto",
      name: "foto",
      kind: "image",
      source: "upload",
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      width: 10,
      height: 10,
    },
  ],
  ir: {
    version: 2,
    behavior: {
      start: [
        { type: "g2d:setupStage", width: 480, height: 360, bg: "#94d5f5" },
        {
          type: "g2d:createImageSprite",
          varName: "personagem",
          x: 21,
          y: 141,
          w: 64,
          h: 64,
          image: "aventureiro",
        },
        {
          type: "g2d:createImageSprite",
          varName: "barco",
          x: 492,
          y: 240,
          w: 88,
          h: 88,
          image: "veleiro",
        },
        { type: "g2d:setVelocity", spriteVar: "barco", vx: { type: "num", value: -1.5 } },
        {
          type: "g2d:createSprite",
          varName: "fundoAviso",
          x: 8,
          y: 8,
          w: 464,
          h: 28,
          color: "#143d35",
        },
        { type: "var", name: "aviso", value: { type: "str", value: "Encontre a chave." } },
        { type: "g2d:enableClassicControls", mode: "directions" },
      ],
      events: [{ type: "g2d:onOverlap", aVar: "personagem", bVar: "barco", body: [] }],
      loops: [
        {
          type: "g2d:updateEachFrame",
          body: [
            { type: "g2d:clear" },
            { type: "g2d:drawBackdrop", ctxVar: "ctx", image: "praia-tropical" },
            { type: "g2d:topDown", spriteVar: "personagem", speed: 3 },
            { type: "g2d:drawSprite", spriteVar: "personagem", ctxVar: "ctx" },
            { type: "g2d:drawSprite", spriteVar: "fundoAviso", ctxVar: "ctx" },
            {
              type: "g2d:drawLabel",
              ctxVar: "ctx",
              text: { type: "var", name: "aviso" },
              x: 20,
              y: 28,
              color: "#ffffff",
              size: 16,
              align: "left",
            },
          ],
        },
      ],
    },
  },
};
