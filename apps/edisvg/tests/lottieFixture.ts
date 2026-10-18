import { identityTransform, transformMatrix } from "@informach/edi-motion";
import { newProject } from "../src/shared/project";
import { editScene, flattenScene } from "../src/shared/scene.js";
import { deformationFixture } from "./deformationFixture";
import { rigFixture } from "./rigFixture";
export function lottieFixture() {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing Lottie board");
  board.scene.viewBox = [10, 20, 300, 200];
  const shapeId = editScene(board.scene, null, "add", {
    tag: "path",
    attrs: { d: "M20 30L80 30L80 90L20 90Z", fill: "#e33a60", stroke: "none" },
  });
  if (!shapeId) throw new Error("Missing Lottie shape");
  project.motion = {
    version: 2,
    animations: [
      {
        id: "animation-lottie",
        name: "Movimento Lottie",
        fps: 30,
        frames: 30,
        mode: "once",
        tracks: [
          {
            id: "track-lottie",
            targetId: shapeId,
            property: "x",
            keys: [
              { id: "key-a", frame: 0, value: 0, easing: "linear" },
              { id: "key-b", frame: 30, value: 120, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  return { project, boardId: board.id, shapeId, clipId: "animation-lottie" };
}

export function lottieStrokeFixture(options: {
  cap: "butt" | "round" | "square";
  animated: boolean;
  reflection: boolean;
  alpha?: number;
  fillAlpha?: number;
  turns?: boolean;
}) {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0],
    clip = fixture.project.motion.animations[0];
  if (!board || !clip) throw new Error("Missing stroked fixture");
  board.scene.viewBox = [0, 0, 300, 200];
  const first = board.scene.nodes[0];
  if (!first) throw new Error("Missing stroked path");
  first.attrs = {
    d: "M20 35C20 35 90 35 90 35C90 35 55 90 55 90C55 90 20 35 20 35Z",
    fill: "#2368e5",
  };
  if (options.fillAlpha !== undefined) first.attrs.fill = `rgba(35,104,229,${options.fillAlpha})`;
  first.basis = options.reflection ? [-1, 0, 0, 1, 135, 0] : [1, 0, 0, 1, 0, 0];
  first.transform = { ...identityTransform(), px: 55, py: 45 };
  const open = editScene(board.scene, null, "add", {
      tag: "path",
      attrs: { d: "M120 40C140 10 160 85 185 45C185 45 215 75 215 75", fill: "none" },
    }),
    line = editScene(board.scene, null, "add", {
      tag: "path",
      attrs: { d: "M120 115C120 115 220 115 220 115", fill: "none", stroke: "#000000" },
    });
  if (!open || !line) throw new Error("Missing open contour/line");
  board.scene.nodes = [
    {
      id: "node-stroke-group",
      name: "Stroked group",
      tag: "g",
      attrs: {
        stroke: `rgba(255,0,0,${options.alpha ?? 0.75})`,
        "stroke-width": "8px",
        "stroke-opacity": "50%",
        "stroke-linecap": options.cap,
        "stroke-linejoin":
          options.cap === "butt" ? "miter" : options.cap === "round" ? "round" : "bevel",
        opacity: "0.6",
      },
      text: "",
      transform: { ...identityTransform(), x: 15, y: 10 },
      basis: transformMatrix({ ...identityTransform(), rotation: 7, sx: 0.9, sy: 0.9 }),
      children: board.scene.nodes,
      visible: true,
      locked: false,
    },
  ];
  fixture.project.transforms = {
    ...fixture.project.transforms,
    sx: 1.05,
    sy: 1.05,
    rotation: -3,
    opacity: 80,
  };
  clip.tracks[0]?.keys.forEach((key) => {
    if (key.frame === 30) key.value = 30;
  });
  if (options.animated)
    for (const property of ["sx", "sy"] as const)
      clip.tracks.push({
        id: `track-stroke-${property}`,
        targetId: "node-stroke-group",
        property,
        keys: [
          { id: `key-stroke-${property}-a`, frame: 0, value: 1, easing: "linear" },
          { id: `key-stroke-${property}-b`, frame: 30, value: 1.3, easing: "linear" },
        ],
      });
  if (options.turns)
    clip.tracks.push({
      id: "track-stroke-turns",
      targetId: "node-stroke-group",
      property: "rotation",
      keys: [
        { id: "key-turns-a", frame: 0, value: 0, easing: "linear" },
        { id: "key-turns-b", frame: 30, value: 3600, easing: "linear" },
      ],
    });
  return fixture;
}

export function lottieRigFixture(kind: "deformation" | "skin") {
  const fixture = kind === "deformation" ? deformationFixture() : rigFixture();
  if (kind === "skin") {
    const art = fixture.run([
      {
        type: "scene",
        operation: "add",
        targetId: null,
        value: {
          tag: "path",
          attrs: {
            d: "M0 -10L100 -10L200 -10L200 10L100 10L0 10Z",
            fill: "#3050a0",
            stroke: "none",
          },
        },
      },
    ]).selected;
    if (!art) throw new Error("Missing Lottie skin path");
    fixture.run([
      {
        type: "rig",
        operation: "bind-skin",
        id: "skin-lottie",
        targetId: art,
        boneIds: ["node-upper", "node-lower"],
        confirmRestPose: true,
      },
    ]);
  }
  const project = fixture.project(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing Lottie rig board");
  board.scene.viewBox = [-40, -40, 320, 260];
  for (const { node } of flattenScene(board.scene)) node.attrs.stroke = "none";
  return { project, boardId: board.id, clipId: fixture.clipId };
}
