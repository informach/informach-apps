import { add, cross, dot, norm, scale, sub, twoBoneIK, type V3 } from "./vec";

/** Proporções do boneco, em metros (≈ 1,76 m de altura). */
export const BODY = {
  upperArm: 0.29,
  forearm: 0.26,
  hand: 0.09,
  thigh: 0.44,
  shin: 0.43,
  foot: 0.17,
  ankleH: 0.07,
  shoulderHalf: 0.19,
  hipHalf: 0.1,
  spine: 0.5,
  neck: 0.09,
  head: 0.11,
} as const;

export const JOINTS = [
  "pelvis",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "wristL",
  "wristR",
  "handL",
  "handR",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
  "ankleL",
  "ankleR",
  "toeL",
  "toeR",
] as const;
export type Joint = (typeof JOINTS)[number];
export type Side = "L" | "R";
export const sideSign = (s: Side) => (s === "L" ? 1 : -1);

/** Referencial do tronco: s = lado esquerdo do boneco, u = coluna (pelve→peito), f = frente do peito. */
export interface Frame {
  s: V3;
  u: V3;
  f: V3;
}

export interface Skeleton {
  j: Record<Joint, V3>;
  torso: Frame;
}

/** Monta um referencial ortonormal com `u` exato e `s` o mais próximo possível da dica. */
export function torsoFrame(u: V3, sHint: V3): Frame {
  const uu = norm(u);
  const s = norm(sub(sHint, scale(uu, dot(sHint, uu))));
  return { s, u: uu, f: cross(s, uu) };
}

/**
 * Direção de um membro no referencial do tronco. pitch: 0 = para baixo ao longo da coluna,
 * 90 = para a frente, 180 = para cima. roll: abertura lateral (abdução) para o lado do membro.
 */
export function limbDir(fr: Frame, side: Side, pitchDeg: number, rollDeg = 0): V3 {
  const p = (pitchDeg * Math.PI) / 180;
  const r = (rollDeg * Math.PI) / 180;
  return norm(
    add(
      add(scale(fr.u, -Math.cos(p) * Math.cos(r)), scale(fr.f, Math.sin(p) * Math.cos(r))),
      scale(fr.s, sideSign(side) * Math.sin(r)),
    ),
  );
}

export class PoseBuilder {
  j: Partial<Record<Joint, V3>> = {};
  constructor(
    pelvis: V3,
    readonly torso: Frame,
  ) {
    const { s, u } = torso;
    this.j.pelvis = pelvis;
    const chest = add(pelvis, scale(u, BODY.spine));
    this.j.chest = chest;
    this.j.shoulderL = add(chest, scale(s, BODY.shoulderHalf));
    this.j.shoulderR = add(chest, scale(s, -BODY.shoulderHalf));
    this.j.hipL = add(pelvis, scale(s, BODY.hipHalf));
    this.j.hipR = add(pelvis, scale(s, -BODY.hipHalf));
    this.headDir(u);
  }

  /** Articulação já posicionada; a ordem de montagem garante que ela exista. */
  at(k: Joint): V3 {
    const p = this.j[k];
    if (!p) throw new Error(`pose incompleta: ${k}`);
    return p;
  }

  headDir(d: V3) {
    const neck = add(this.at("chest"), scale(this.torso.u, BODY.neck));
    this.j.neck = neck;
    this.j.head = add(neck, scale(norm(d), BODY.head));
    return this;
  }

  armFK(side: Side, upper: V3, fore: V3) {
    const sh = this.at(`shoulder${side}`);
    const el = add(sh, scale(norm(upper), BODY.upperArm));
    this.j[`elbow${side}`] = el;
    this.j[`wrist${side}`] = add(el, scale(norm(fore), BODY.forearm));
    return this;
  }

  armIK(side: Side, wrist: V3, pole: V3) {
    const sh = this.at(`shoulder${side}`);
    const el = twoBoneIK(sh, wrist, BODY.upperArm, BODY.forearm, pole);
    this.j[`elbow${side}`] = el;
    this.j[`wrist${side}`] = add(el, scale(norm(sub(wrist, el)), BODY.forearm));
    return this;
  }

  legFK(side: Side, thigh: V3, shin: V3) {
    const hip = this.at(`hip${side}`);
    const kn = add(hip, scale(norm(thigh), BODY.thigh));
    this.j[`knee${side}`] = kn;
    this.j[`ankle${side}`] = add(kn, scale(norm(shin), BODY.shin));
    return this;
  }

  legIK(side: Side, ankle: V3, pole: V3) {
    const hip = this.at(`hip${side}`);
    const kn = twoBoneIK(hip, ankle, BODY.thigh, BODY.shin, pole);
    this.j[`knee${side}`] = kn;
    this.j[`ankle${side}`] = add(kn, scale(norm(sub(ankle, kn)), BODY.shin));
    return this;
  }

  /** Coloca o joelho diretamente (coxa e canela partem do quadril e do joelho dados). */
  legKnee(side: Side, knee: V3, shinDir: V3) {
    const hip = this.at(`hip${side}`);
    const kn = add(hip, scale(norm(sub(knee, hip)), BODY.thigh));
    this.j[`knee${side}`] = kn;
    this.j[`ankle${side}`] = add(kn, scale(norm(shinDir), BODY.shin));
    return this;
  }

  foot(side: Side, dir: V3) {
    this.j[`toe${side}`] = add(this.at(`ankle${side}`), scale(norm(dir), BODY.foot));
    return this;
  }

  hand(side: Side, dir: V3) {
    this.j[`hand${side}`] = add(this.at(`wrist${side}`), scale(norm(dir), BODY.hand));
    return this;
  }

  build(): Skeleton {
    const f = this.torso.f;
    for (const side of ["L", "R"] as const) {
      if (!this.j[`hand${side}`])
        this.hand(side, sub(this.at(`wrist${side}`), this.at(`elbow${side}`)));
      if (!this.j[`toe${side}`]) this.foot(side, add(scale(f, 0.94), scale(this.torso.u, -0.34)));
    }
    for (const k of JOINTS) if (!this.j[k]) throw new Error(`pose incompleta: ${k}`);
    return { j: this.j as Record<Joint, V3>, torso: this.torso };
  }
}
