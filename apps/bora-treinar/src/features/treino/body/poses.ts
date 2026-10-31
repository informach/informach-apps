import {
  BODY,
  limbDir,
  PoseBuilder,
  type Side,
  type Skeleton,
  sideSign,
  torsoFrame,
} from "./skeleton";
import { add, lerp, norm, rad, rotateToward, scale, sub, type V3, v } from "./vec";

/**
 * Estado de animação de um exercício.
 * depth: 0 = posição inicial (topo), 1 = ponto máximo do movimento (fundo).
 * phase: 0..1 ao longo de um ciclo completo (usado para saltos e movimentos assimétricos).
 * time: segundos contínuos (respiração e pequenos movimentos secundários).
 * cycle: índice da repetição; exercícios alternados trocam de lado a cada uma.
 */
export interface PoseState {
  depth: number;
  phase: number;
  time: number;
  cycle?: number;
}
export type PoseFn = (st: PoseState) => Skeleton;

const UP: V3 = [0, 1, 0];
const DOWN: V3 = [0, -1, 0];
const FWD: V3 = [0, 0, 1];
const LEFT: V3 = [1, 0, 0];
const SIDES: Side[] = ["L", "R"];
const breath = (t: number, amp = 0.006) => Math.sin(t * 1.7) * amp;
/** Lado que trabalha numa repetição de exercício alternado. */
const activeSide = (cycle = 0): Side => (cycle % 2 === 0 ? "L" : "R");
/** Direção no plano sagital: 0° = para a frente (+z), 90° = para cima. */
const sagittal = (deg: number): V3 => [0, Math.sin(rad(deg)), Math.cos(rad(deg))];

function standingLegs(b: PoseBuilder, halfWidth: number, lift = 0, outDeg = 8, kneeOut = 0.25) {
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    b.legIK(sd, v(sg * halfWidth, BODY.ankleH + lift, 0), norm(v(sg * kneeOut, 0, 1)));
    const o = rad(outDeg) * sg;
    b.foot(sd, v(Math.sin(o) * 0.94, -0.34, Math.cos(o) * 0.94));
  }
}

const idle: PoseFn = ({ time }) => {
  const b = new PoseBuilder(v(0, 0.925 + breath(time), 0), torsoFrame(UP, LEFT));
  for (const sd of SIDES) {
    b.armFK(sd, limbDir(b.torso, sd, 4, 9), limbDir(b.torso, sd, 16, 6));
  }
  standingLegs(b, 0.11);
  return b.build();
};

const celebrate: PoseFn = ({ phase, time }) => {
  const hop = 0.08 * Math.max(0, Math.sin(phase * Math.PI * 2));
  const b = new PoseBuilder(v(0, 0.925 + hop + breath(time), 0), torsoFrame(UP, LEFT));
  const raise = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  for (const sd of SIDES) {
    b.armFK(sd, limbDir(b.torso, sd, 150, 32 + 10 * raise), limbDir(b.torso, sd, 165, 26));
  }
  standingLegs(b, 0.12, hop);
  return b.build();
};

interface SquatOpts {
  halfWidth: number;
  outDeg: number;
  kneeOut: number;
  leanMax: number;
  bottomY: number;
  backZ: number;
  /** salto no fim de cada repetição: fração do ciclo em que a subida termina */
  jumpAfter?: number;
}

function squatPose(o: SquatOpts): PoseFn {
  return ({ depth: d, phase, time }) => {
    const hop =
      o.jumpAfter !== undefined && phase > o.jumpAfter
        ? 0.14 * Math.sin((Math.PI * (phase - o.jumpAfter)) / (1 - o.jumpAfter))
        : 0;
    const lean = lerp(4, o.leanMax, d);
    const u = rotateToward(UP, FWD, rad(lean));
    const b = new PoseBuilder(
      v(0, lerp(0.925, o.bottomY, d) + hop + breath(time) * (1 - d), lerp(0, o.backZ, d)),
      torsoFrame(u, LEFT),
    );
    // no salto os braços sobem; no agachamento vão à frente para equilibrar
    const pitch = hop > 0 ? lerp(60, 160, hop / 0.14) : lerp(8, 90 + lean, d);
    for (const sd of SIDES)
      b.armFK(sd, limbDir(b.torso, sd, pitch, lerp(9, 4, d)), limbDir(b.torso, sd, pitch + 4, 2));
    standingLegs(b, o.halfWidth, hop, o.outDeg, o.kneeOut);
    return b.build();
  };
}

interface PushOpts {
  knees: boolean;
  handX: number;
  elbowOut: number;
  /** altura das mãos: 0,05 no chão; mais alto com apoio (sofá, cadeira) */
  handY?: number;
}

const PUSH_TOP = 0.54;
const PUSH_BOTTOM = 0.27;

/** Geometria da flexão: o corpo gira em torno dos pés (ou joelhos) apoiados no chão. */
function pushupGeometry(o: PushOpts) {
  const handY = o.handY ?? 0.05;
  const pivotY = o.knees ? 0.06 : 0.1;
  const pivotZ = o.knees ? -0.3 : -0.75;
  const L = (o.knees ? BODY.thigh : BODY.thigh + BODY.shin) + BODY.spine;
  const theta = (h: number) => Math.asin((h - pivotY) / L);
  const handZ = pivotZ + L * Math.cos(theta(handY + PUSH_TOP)) + 0.02;
  return { handY, pivotY, pivotZ, L, theta, handZ };
}

function pushupPose(o: PushOpts): PoseFn {
  const g = pushupGeometry(o);
  return ({ depth: d, time }) => {
    const th = g.theta(lerp(g.handY + PUSH_TOP, g.handY + PUSH_BOTTOM, d) + breath(time, 0.003));
    const dirBody: V3 = [0, Math.sin(th), Math.cos(th)];
    const pivot = v(0, g.pivotY, g.pivotZ);
    const pelvis = add(pivot, scale(dirBody, g.L - BODY.spine));
    const b = new PoseBuilder(pelvis, torsoFrame(dirBody, LEFT));
    b.headDir(rotateToward(b.torso.u, b.torso.f, rad(18)));
    for (const sd of SIDES) {
      const sg = sideSign(sd);
      if (o.knees) {
        const knee = v(sg * 0.1, g.pivotY, g.pivotZ);
        b.legKnee(sd, knee, v(0, 0.37, -0.93));
        b.foot(sd, v(0, -0.25, -1));
      } else {
        b.legIK(sd, v(sg * 0.09, g.pivotY, g.pivotZ), v(0, -1, 0));
        b.foot(sd, v(0, -0.55, -0.83));
      }
      b.armIK(sd, v(sg * o.handX, g.handY, g.handZ), norm(v(sg * o.elbowOut, 0.15, -1)));
      b.hand(sd, v(sg * 0.15, -0.25, 1));
    }
    return b.build();
  };
}

const INCLINE: PushOpts = { knees: false, handX: 0.25, elbowOut: 0.7, handY: 0.4 };

/** Flexão pike: quadril alto, corpo em V invertido, cabeça desce entre as mãos. */
const pike: PoseFn = ({ depth: d, time }) => {
  const hands = v(0, 0.05, 0.5);
  const pelvis = v(0, lerp(0.88, 0.7, d) + breath(time, 0.003), lerp(-0.12, -0.02, d));
  const u = norm(sub(hands, pelvis));
  const b = new PoseBuilder(pelvis, torsoFrame(u, LEFT));
  b.headDir(u);
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    b.legIK(sd, v(sg * 0.1, BODY.ankleH, -0.38), FWD).foot(sd, v(0, -0.5, 0.86));
    b.armIK(sd, v(sg * 0.22, 0.05, 0.5), norm(v(sg * 0.6, 0.4, -0.6)));
    b.hand(sd, v(sg * 0.1, -0.3, 1));
  }
  return b.build();
};

const jumpingJack: PoseFn = ({ depth: o, phase, time }) => {
  const hop = 0.07 * Math.abs(Math.sin(phase * Math.PI * 2));
  const b = new PoseBuilder(
    v(0, 0.92 - 0.04 * o + hop + breath(time, 0.003), 0),
    torsoFrame(UP, LEFT),
  );
  for (const sd of SIDES) {
    b.armFK(
      sd,
      limbDir(b.torso, sd, 4, lerp(10, 165, o)),
      limbDir(b.torso, sd, 6, lerp(14, 176, o)),
    );
  }
  standingLegs(b, lerp(0.1, 0.34, o), hop);
  return b.build();
};

/** Mãos na cintura, para exercícios em pé em que os braços não trabalham. */
function handsOnHips(b: PoseBuilder) {
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    const hip = b.at(`hip${sd}`);
    const wrist = add(
      add(hip, scale(b.torso.s, sg * 0.08)),
      add(scale(b.torso.u, 0.07), scale(b.torso.f, 0.02)),
    );
    b.armIK(sd, wrist, norm(v(sg * 0.7, 0, -0.7)));
    b.hand(sd, v(-sg * 0.3, -0.6, 0.7));
  }
}

const lunge: PoseFn = ({ depth: d, time }) => {
  const b = new PoseBuilder(
    v(0, lerp(0.88, 0.5, d) + breath(time) * (1 - d), lerp(-0.02, -0.05, d)),
    torsoFrame(UP, LEFT),
  );
  // pé esquerdo à frente, direito atrás na ponta do pé
  b.legIK("L", v(0.11, BODY.ankleH, 0.28), FWD).foot("L", v(0.08, -0.34, 0.94));
  b.legIK("R", v(-0.11, 0.12, -0.38), FWD).foot("R", v(0, -0.6, 0.8));
  handsOnHips(b);
  return b.build();
};

/** Afundo reverso: em pé com os pés juntos, a perna de trás recua e desce. */
const reverseLunge: PoseFn = ({ depth: d, time }) => {
  const b = new PoseBuilder(
    v(0, lerp(0.92, 0.5, d) + breath(time) * (1 - d), lerp(0, -0.17, d)),
    torsoFrame(UP, LEFT),
  );
  b.legIK("L", v(0.11, BODY.ankleH, 0.1), FWD).foot("L", v(0.08, -0.34, 0.94));
  b.legIK("R", v(-0.11, lerp(BODY.ankleH, 0.12, d), lerp(0.02, -0.52, d)), v(0, -0.3, 1));
  b.foot("R", norm(v(0, lerp(-0.34, -0.6, d), lerp(0.94, 0.8, d))));
  handsOnHips(b);
  return b.build();
};

/** Dobradiça de quadril: tronco inclina à frente com o quadril indo para trás. */
const hinge: PoseFn = ({ depth: d, time }) => {
  const u = rotateToward(UP, FWD, rad(lerp(3, 80, d)));
  const b = new PoseBuilder(
    v(0, lerp(0.925, 0.86, d) + breath(time) * (1 - d), lerp(0, -0.14, d)),
    torsoFrame(u, LEFT),
  );
  // mãos cruzadas sobre o peito
  for (const sd of SIDES)
    b.armFK(sd, limbDir(b.torso, sd, 35, -10), limbDir(b.torso, sd, 100, -70));
  standingLegs(b, 0.13);
  return b.build();
};

const plank: PoseFn = ({ time }) => {
  const pivotY = 0.1;
  const pivotZ = -0.8;
  const L = BODY.thigh + BODY.shin + BODY.spine;
  const th = Math.asin((0.05 + BODY.upperArm - pivotY + breath(time, 0.004)) / L);
  const dirBody: V3 = [0, Math.sin(th), Math.cos(th)];
  const pelvis = add(v(0, pivotY, pivotZ), scale(dirBody, L - BODY.spine));
  const b = new PoseBuilder(pelvis, torsoFrame(dirBody, LEFT));
  b.headDir(rotateToward(b.torso.u, b.torso.f, rad(12)));
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    b.legIK(sd, v(sg * 0.09, pivotY, pivotZ), v(0, -1, 0)).foot(sd, v(0, -0.55, -0.83));
    b.armFK(sd, v(-sg * 0.06, -1, 0), v(-sg * 0.22, 0, 1));
    b.hand(sd, v(-sg * 0.3, -0.1, 1));
  }
  return b.build();
};

/**
 * Prancha lateral de frente para a câmera: apoio no antebraço esquerdo, corpo
 * em linha ao longo do eixo x e braço de cima estendido para o alto.
 */
const sidePlank: PoseFn = ({ time }) => {
  const L = BODY.thigh + BODY.shin + BODY.spine;
  const pivot = v(-0.7, 0.12, 0);
  // ombro de apoio logo acima do cotovelo: resolve o ângulo do corpo por iteração curta
  let th = rad(17);
  for (let i = 0; i < 4; i++) {
    const chestY = 0.05 + BODY.upperArm + BODY.shoulderHalf * Math.cos(th);
    th = Math.asin((chestY - pivot[1]) / L);
  }
  th += breath(time, 0.004);
  const dirBody: V3 = [Math.cos(th), Math.sin(th), 0];
  const pelvis = add(pivot, scale(dirBody, L - BODY.spine));
  const b = new PoseBuilder(pelvis, torsoFrame(dirBody, DOWN));
  b.headDir(b.torso.u);
  const s = b.torso.s;
  b.legIK("L", add(pivot, scale(s, 0.08)), b.torso.f).foot(
    "L",
    add(b.torso.f, scale(dirBody, -0.3)),
  );
  b.legIK("R", add(pivot, scale(s, -0.08)), b.torso.f).foot(
    "R",
    add(b.torso.f, scale(dirBody, -0.3)),
  );
  b.armFK("L", DOWN, FWD).hand("L", FWD);
  b.armFK("R", scale(s, -1), scale(s, -1));
  return b.build();
};

/** Super-homem: de bruços, braços e pernas estendidos e levantados do chão. */
const superman: PoseFn = ({ time }) => {
  const lift = 12 + breath(time, 1.2);
  const u = rotateToward(FWD, UP, rad(lift));
  const b = new PoseBuilder(v(0, 0.12, 0), torsoFrame(u, LEFT));
  b.headDir(u);
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    const leg = norm(v(sg * 0.04, Math.sin(rad(10)), -Math.cos(rad(10))));
    b.legFK(sd, leg, leg).foot(sd, v(0, -0.2, -1));
    const arm = norm(v(sg * 0.15, Math.sin(rad(15)), Math.cos(rad(15))));
    b.armFK(sd, arm, arm);
  }
  return b.build();
};

/** Escalador: prancha alta, um joelho por vez vem em direção ao peito. */
const mountainClimber: PoseFn = ({ depth: d, time, cycle }) => {
  const g = pushupGeometry({ knees: false, handX: 0.22, elbowOut: 0.5 });
  const th = g.theta(g.handY + PUSH_TOP + breath(time, 0.003));
  const dirBody: V3 = [0, Math.sin(th), Math.cos(th)];
  const pivot = v(0, g.pivotY, g.pivotZ);
  const pelvis = add(pivot, scale(dirBody, g.L - BODY.spine));
  const b = new PoseBuilder(pelvis, torsoFrame(dirBody, LEFT));
  b.headDir(rotateToward(b.torso.u, b.torso.f, rad(18)));
  const active = activeSide(cycle);
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    const back = v(sg * 0.09, g.pivotY, g.pivotZ);
    if (sd === active) {
      const tucked = v(sg * 0.1, 0.12, pelvis[2] - 0.02);
      b.legIK(sd, add(scale(back, 1 - d), scale(tucked, d)), norm(v(0, -1, 0.6)));
      b.foot(sd, v(0, -0.4, -0.9));
    } else {
      b.legIK(sd, back, v(0, -1, 0)).foot(sd, v(0, -0.55, -0.83));
    }
    b.armIK(sd, v(sg * 0.22, g.handY, g.handZ), norm(v(sg * 0.5, 0.15, -1)));
    b.hand(sd, v(sg * 0.15, -0.25, 1));
  }
  return b.build();
};

const situp: PoseFn = ({ depth: d, time }) => {
  const u = rotateToward(v(0, 0, -1), UP, rad(lerp(0, 70, d) + breath(time, 0.6)));
  const b = new PoseBuilder(v(0, 0.1, 0), torsoFrame(u, LEFT));
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    b.legIK(sd, v(sg * 0.12, 0.08, 0.5), v(0, 1, 0.2)).foot(sd, v(0, -0.45, 0.9));
  }
  const knees = scale(add(b.at("kneeL"), b.at("kneeR")), 0.5);
  for (const sd of SIDES) {
    const toKnees = norm(sub(knees, b.at(`shoulder${sd}`)));
    const dir = norm(add(scale(v(0, -0.05, 1), 1 - d), scale(toKnees, d)));
    b.armFK(sd, dir, dir);
  }
  return b.build();
};

/** Abdominal bicicleta: deitado com o tronco enrolado, um joelho por vez vem ao peito. */
const bicycle: PoseFn = ({ depth: d, time, cycle }) => {
  const u = rotateToward(v(0, 0, -1), UP, rad(lerp(25, 35, d) + breath(time, 0.6)));
  const b = new PoseBuilder(v(0, 0.1, 0), torsoFrame(u, LEFT));
  const active = activeSide(cycle);
  for (const sd of SIDES) {
    const thigh = sagittal(sd === active ? lerp(40, 115, d) : 40);
    const shin = sd === active ? norm(add(scale(thigh, 1 - d), scale(v(0, -0.15, 1), d))) : thigh;
    b.legFK(sd, thigh, shin).foot(sd, add(scale(shin, 0.4), v(0, 0.6, 0)));
    // mãos atrás da cabeça, cotovelos abertos
    b.armFK(sd, limbDir(b.torso, sd, 165, 70), limbDir(b.torso, sd, 175, -60));
  }
  return b.build();
};

/** Corrida parada com joelho alto: um joelho por vez sobe até a altura do quadril. */
const highKnees: PoseFn = ({ depth: d, time, cycle }) => {
  const b = new PoseBuilder(v(0, 0.925 + breath(time, 0.004), 0), torsoFrame(UP, LEFT));
  const active = activeSide(cycle);
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    if (sd === active) {
      const thigh = norm(v(0, -Math.cos(rad(lerp(5, 92, d))), Math.sin(rad(lerp(5, 92, d)))));
      b.legFK(sd, thigh, v(0, -1, 0.05)).foot(sd, v(sg * 0.1, -0.5, 0.86));
    } else {
      b.legIK(sd, v(sg * 0.11, BODY.ankleH, 0), norm(v(sg * 0.25, 0, 1)));
      b.foot(sd, v(sg * 0.14, -0.34, 0.93));
    }
    // braço oposto à perna que sobe vai à frente
    const swing = sd === active ? lerp(10, -25, d) : lerp(10, 60, d);
    b.armFK(sd, limbDir(b.torso, sd, swing, 8), limbDir(b.torso, sd, swing + 80, 4));
  }
  return b.build();
};

function bridgePose(singleLeg: boolean): PoseFn {
  return ({ depth: d, time }) => {
    const chest = v(0, 0.1, -0.45);
    const y = lerp(0.12, 0.35, d) + breath(time, 0.003);
    const pelvis = v(0, y, chest[2] + Math.sqrt(BODY.spine ** 2 - (y - chest[1]) ** 2));
    const b = new PoseBuilder(pelvis, torsoFrame(sub(chest, pelvis), LEFT));
    b.legIK("L", v(0.13, 0.08, 0.45), v(0, 1, 0.2)).foot("L", v(0, -0.45, 0.9));
    if (singleLeg) {
      // perna direita estendida, na continuação da coxa esquerda
      const thigh = norm(sub(b.at("kneeL"), b.at("hipL")));
      b.legFK("R", thigh, thigh).foot("R", v(0, 0.3, 1));
    } else b.legIK("R", v(-0.13, 0.08, 0.45), v(0, 1, 0.2)).foot("R", v(0, -0.45, 0.9));
    for (const sd of SIDES) {
      const sg = sideSign(sd);
      b.armFK(sd, v(sg * 0.15, -0.12, 1), v(sg * 0.05, -0.02, 1));
    }
    return b.build();
  };
}

/** Cadeira na parede: costas apoiadas, coxas quase paralelas ao chão. */
const wallSit: PoseFn = ({ time }) => {
  const b = new PoseBuilder(v(0, 0.5 + breath(time, 0.003), -0.2), torsoFrame(UP, LEFT));
  for (const sd of SIDES) {
    const sg = sideSign(sd);
    b.legIK(sd, v(sg * 0.13, BODY.ankleH, 0.24), FWD).foot(sd, v(sg * 0.1, -0.34, 0.94));
    b.armFK(sd, limbDir(b.torso, sd, 6, 12), limbDir(b.torso, sd, 14, 8));
  }
  return b.build();
};

export const POSES = {
  idle,
  celebrate,
  squat: squatPose({
    halfWidth: 0.16,
    outDeg: 12,
    kneeOut: 0.25,
    leanMax: 42,
    bottomY: 0.5,
    backZ: -0.2,
  }),
  sumoSquat: squatPose({
    halfWidth: 0.3,
    outDeg: 35,
    kneeOut: 0.8,
    leanMax: 20,
    bottomY: 0.52,
    backZ: -0.08,
  }),
  jumpSquat: squatPose({
    halfWidth: 0.15,
    outDeg: 12,
    kneeOut: 0.25,
    leanMax: 34,
    bottomY: 0.56,
    backZ: -0.16,
    jumpAfter: 0.7,
  }),
  pushup: pushupPose({ knees: false, handX: 0.25, elbowOut: 0.7 }),
  pushupKnees: pushupPose({ knees: true, handX: 0.25, elbowOut: 0.7 }),
  pushupDiamond: pushupPose({ knees: false, handX: 0.06, elbowOut: 0.25 }),
  pushupIncline: pushupPose(INCLINE),
  pike,
  jumpingJack,
  lunge,
  reverseLunge,
  hinge,
  plank,
  sidePlank,
  superman,
  mountainClimber,
  situp,
  bicycle,
  highKnees,
  bridge: bridgePose(false),
  bridgeSingle: bridgePose(true),
  wallSit,
} satisfies Record<string, PoseFn>;

export type PoseId = keyof typeof POSES;

/** Objeto de cena que aparece junto do instrutor: caixa centrada em `center`, medidas em metros. */
export interface PropBox {
  center: V3;
  size: V3;
}

/** Apoio (sofá, cadeira) sob as mãos da flexão inclinada e parede atrás da cadeira na parede. */
export const PROPS: Record<"apoio" | "parede", PropBox> = {
  apoio: (() => {
    const g = pushupGeometry(INCLINE);
    const top = g.handY - 0.04;
    return { center: v(0, top / 2, g.handZ + 0.12), size: v(0.95, top, 0.42) };
  })(),
  parede: { center: v(0, 0.8, -0.42), size: v(1.6, 1.6, 0.06) },
};
