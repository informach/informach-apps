import * as THREE from "three";
import { type Cadence, cadenceState } from "../body/cadence";
import { POSES, type PoseId, PROPS } from "../body/poses";
import { JOINTS, type Joint, type Skeleton } from "../body/skeleton";
import type { V3 } from "../body/vec";
import type { Joint3D, View } from "../catalog/catalog";

export type InstructorMode = "cadence" | "follow" | "hold" | "idle" | "celebrate";

const BODY_COLOR = "#59616B";
const HIGHLIGHT_COLOR = "#9DBF2A";
const JOINT_COLOR = "#C8FF2E";

interface Segment {
  a: Joint;
  b: Joint;
  r: number;
  group?: Joint3D;
  /** tronco: usa o referencial completo e achata na profundidade */
  torso?: boolean;
}

const SEGMENTS: Segment[] = [
  { a: "shoulderL", b: "elbowL", r: 0.047, group: "arms" },
  { a: "shoulderR", b: "elbowR", r: 0.047, group: "arms" },
  { a: "elbowL", b: "wristL", r: 0.039, group: "arms" },
  { a: "elbowR", b: "wristR", r: 0.039, group: "arms" },
  { a: "wristL", b: "handL", r: 0.03 },
  { a: "wristR", b: "handR", r: 0.03 },
  { a: "hipL", b: "kneeL", r: 0.07, group: "legs" },
  { a: "hipR", b: "kneeR", r: 0.07, group: "legs" },
  { a: "kneeL", b: "ankleL", r: 0.053, group: "legs" },
  { a: "kneeR", b: "ankleR", r: 0.053, group: "legs" },
  { a: "ankleL", b: "toeL", r: 0.036 },
  { a: "ankleR", b: "toeR", r: 0.036 },
  { a: "chest", b: "neck", r: 0.045 },
  { a: "shoulderL", b: "shoulderR", r: 0.056, group: "shoulders" },
  { a: "hipL", b: "hipR", r: 0.085, group: "glutes" },
  { a: "pelvis", b: "chest", r: 0.12, group: "core", torso: true },
];

const JOINT_SPHERES: [Joint, number][] = [
  ["shoulderL", 0.058],
  ["shoulderR", 0.058],
  ["elbowL", 0.048],
  ["elbowR", 0.048],
  ["wristL", 0.036],
  ["wristR", 0.036],
  ["hipL", 0.072],
  ["hipR", 0.072],
  ["kneeL", 0.062],
  ["kneeR", 0.062],
  ["ankleL", 0.046],
  ["ankleR", 0.046],
];

const VIEW_AZIMUTH: Record<View, number> = { front: 0, three4: 38, side: 90 };

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);
const toV = (p: V3) => tmpV.set(p[0], p[1], p[2]);

/**
 * Instrutor 3D: manequim no estilo dos bonecos do Mixamo, animado pelas poses procedurais.
 * Funciona sozinho num canvas e se ajusta ao tamanho do elemento pai.
 */
export class InstructorScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  private segMeshes: { seg: Segment; mesh: THREE.Mesh; len: number }[] = [];
  private jointMeshes: { j: Joint; mesh: THREE.Mesh }[] = [];
  private chestMesh: THREE.Mesh;
  private head: THREE.Mesh;
  private bodyMat = new THREE.MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.42,
    metalness: 0.25,
  });
  private hiMat = new THREE.MeshStandardMaterial({
    color: HIGHLIGHT_COLOR,
    roughness: 0.4,
    metalness: 0.2,
    emissive: "#C8FF2E",
    emissiveIntensity: 0.12,
  });
  /** sofá/cadeira da flexão inclinada e parede da cadeira na parede */
  private props: Record<keyof typeof PROPS, THREE.Mesh>;
  private raf = 0;
  private last = performance.now();
  private resize: ResizeObserver;

  private pose: PoseId = "idle";
  private cadence: Cadence = { down: 1, bottom: 0, up: 1, top: 0.5 };
  private mode: InstructorMode = "idle";
  private time = 0;
  private cycleT = 0;
  private depth = 0;
  private followTarget = 0;
  private paused = false;
  private blendFrom: Skeleton | null = null;
  private blendT = 1;
  private current: Skeleton | null = null;

  private azimuth = 0;
  private azimuthTarget = 0;
  private dragOffset = 0;
  private focus = new THREE.Vector3(0, 0.9, 0);
  private focusTarget = new THREE.Vector3(0, 0.9, 0);
  private radius = 1.1;
  private radiusTarget = 1.1;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
      touchAction: "none",
    });

    this.scene.add(new THREE.HemisphereLight("#dfe7f2", "#0b0d10", 1.6));
    const key = new THREE.DirectionalLight("#ffffff", 2.6);
    key.position.set(2.2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -2,
      right: 2,
      top: 2,
      bottom: -2,
      near: 0.5,
      far: 12,
    });
    key.shadow.radius = 4;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#7FA8FF", 2.2);
    rim.position.set(-2.5, 2.5, -3);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 64),
      new THREE.ShadowMaterial({ opacity: 0.45 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    for (const [r, o] of [
      [0.9, 0.22],
      [1.6, 0.12],
      [2.3, 0.06],
    ] as const) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.004, r + 0.004, 96),
        new THREE.MeshBasicMaterial({ color: JOINT_COLOR, transparent: true, opacity: o }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.001;
      this.scene.add(ring);
    }

    const jointMat = new THREE.MeshStandardMaterial({
      color: JOINT_COLOR,
      roughness: 0.35,
      emissive: JOINT_COLOR,
      emissiveIntensity: 0.25,
    });
    const ref = POSES.idle({ depth: 0, phase: 0, time: 0 });
    for (const seg of SEGMENTS) {
      const len = seg.torso ? 0.36 : Math.max(0.01, dist(ref.j[seg.a], ref.j[seg.b]));
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, len, 6, 16), this.bodyMat);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.segMeshes.push({ seg, mesh, len });
    }
    this.chestMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.14, 6, 18), this.bodyMat);
    this.chestMesh.castShadow = true;
    this.scene.add(this.chestMesh);
    for (const [j, r] of JOINT_SPHERES) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), jointMat);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.jointMeshes.push({ j, mesh });
    }
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 28, 20), this.bodyMat);
    this.head.scale.set(0.92, 1.12, 1);
    this.head.castShadow = true;
    this.scene.add(this.head);
    const visor = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.022, 0.09, 4, 12),
      new THREE.MeshStandardMaterial({
        color: JOINT_COLOR,
        emissive: JOINT_COLOR,
        emissiveIntensity: 0.6,
      }),
    );
    visor.rotation.z = Math.PI / 2;
    visor.position.set(0, 0.015, 0.088);
    this.head.add(visor);

    const propMat = new THREE.MeshStandardMaterial({ color: "#2A3038", roughness: 0.8 });
    const makeProp = (box: (typeof PROPS)[keyof typeof PROPS]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...box.size), propMat);
      mesh.position.set(...box.center);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.props = { apoio: makeProp(PROPS.apoio), parede: makeProp(PROPS.parede) };

    this.resize = new ResizeObserver(() => this.onResize());
    this.resize.observe(host);
    this.onResize();
    this.bindDrag();
    this.loop();
  }

  setExercise(
    pose: PoseId,
    cadence: Cadence,
    highlight: Joint3D[],
    view: View,
    prop?: keyof typeof PROPS,
  ) {
    for (const [name, mesh] of Object.entries(this.props)) mesh.visible = name === prop;
    const changed = pose !== this.pose;
    this.cadence = cadence;
    if (changed) {
      this.startBlend();
      this.pose = pose;
      this.cycleT = 0;
      this.frame(pose);
    }
    for (const s of this.segMeshes)
      s.mesh.material = s.seg.group && highlight.includes(s.seg.group) ? this.hiMat : this.bodyMat;
    this.chestMesh.material = highlight.includes("chest") ? this.hiMat : this.bodyMat;
    this.setView(view);
  }

  setMode(mode: InstructorMode) {
    if (mode === this.mode) return;
    if (
      mode === "idle" ||
      mode === "celebrate" ||
      this.mode === "idle" ||
      this.mode === "celebrate"
    )
      this.startBlend();
    this.mode = mode;
    if (mode === "idle" || mode === "celebrate")
      for (const mesh of Object.values(this.props)) mesh.visible = false;
    if (mode === "cadence") this.cycleT = 0;
    if (mode === "idle" || mode === "celebrate") this.frame("idle");
    else this.frame(this.pose);
  }

  /** profundidade 0..1 vinda da câmera, para o boneco acompanhar a pessoa */
  setFollowDepth(d: number) {
    this.followTarget = d;
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  setView(view: View) {
    this.azimuthTarget = VIEW_AZIMUTH[view];
    this.dragOffset = 0;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.renderer.domElement.remove();
  }

  private startBlend() {
    if (this.current) {
      this.blendFrom = this.current;
      this.blendT = 0;
    }
  }

  /** enquadra o movimento inteiro do exercício na câmera */
  private frame(pose: PoseId) {
    const box = new THREE.Box3();
    for (const d of [0, 0.5, 1]) {
      const sk = POSES[pose]({ depth: d, phase: d / 2, time: 0 });
      for (const j of JOINTS) box.expandByPoint(toV(sk.j[j]));
    }
    box.expandByPoint(tmpV.set(box.min.x, 0, box.min.z));
    const size = box.getSize(new THREE.Vector3());
    box.getCenter(this.focusTarget);
    this.focusTarget.y = Math.max(this.focusTarget.y, 0.35);
    this.radiusTarget = Math.max(size.x, size.y, size.z) / 2 + 0.25;
  }

  private onResize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private bindDrag() {
    const el = this.renderer.domElement;
    let x0: number | null = null;
    el.addEventListener("pointerdown", (e) => {
      x0 = e.clientX;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (x0 === null) return;
      this.dragOffset += (e.clientX - x0) * 0.4;
      x0 = e.clientX;
    });
    el.addEventListener("pointerup", () => (x0 = null));
    el.addEventListener("pointercancel", () => (x0 = null));
  }

  private computeSkeleton(dt: number): Skeleton {
    if (this.mode === "idle") return POSES.idle({ depth: 0, phase: 0, time: this.time });
    if (this.mode === "celebrate")
      return POSES.celebrate({ depth: 0, phase: (this.time * 0.9) % 1, time: this.time });
    if (this.mode === "hold") return POSES[this.pose]({ depth: 0, phase: 0, time: this.time });
    if (this.mode === "follow") {
      const prev = this.depth;
      this.depth += (this.followTarget - this.depth) * Math.min(1, dt * 12);
      const phase = this.depth >= prev ? this.depth / 2 : 1 - this.depth / 2;
      return POSES[this.pose]({ depth: this.depth, phase, time: this.time });
    }
    this.cycleT += dt;
    const st = cadenceState(this.cadence, this.cycleT);
    this.depth = st.depth;
    return POSES[this.pose]({
      depth: st.depth,
      phase: st.phase,
      time: this.time,
      cycle: st.cycle,
    });
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.time += dt;

    let sk = this.computeSkeleton(this.paused ? 0 : dt);
    if (this.blendFrom && this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / 0.45);
      const k = this.blendT * this.blendT * (3 - 2 * this.blendT);
      const from = this.blendFrom;
      const j = Object.fromEntries(
        JOINTS.map((n) => [n, lerp3(from.j[n], sk.j[n], k)]),
      ) as Skeleton["j"];
      sk = { j, torso: sk.torso };
    }
    this.current = sk;
    this.place(sk);

    const ease = Math.min(1, dt * 4);
    this.azimuth += (this.azimuthTarget + this.dragOffset - this.azimuth) * ease;
    this.focus.lerp(this.focusTarget, ease);
    this.radius += (this.radiusTarget - this.radius) * ease;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const distance = this.radius / Math.sin(Math.min(vfov, hfov) / 2);
    const az = (this.azimuth * Math.PI) / 180;
    const el = (13 * Math.PI) / 180;
    this.camera.position.set(
      this.focus.x + distance * Math.sin(az) * Math.cos(el),
      this.focus.y + distance * Math.sin(el),
      this.focus.z + distance * Math.cos(az) * Math.cos(el),
    );
    this.camera.lookAt(this.focus);
    this.renderer.render(this.scene, this.camera);
  };

  private place(sk: Skeleton) {
    const { s, u, f } = sk.torso;
    for (const { seg, mesh, len } of this.segMeshes) {
      const a = sk.j[seg.a];
      const b = sk.j[seg.b];
      if (seg.torso) {
        // abdômen: da pelve até um pouco abaixo do peito
        const p = lerp3(a, b, 0.4);
        mesh.position.set(p[0], p[1], p[2]);
        tmpM.makeBasis(new THREE.Vector3(...s), new THREE.Vector3(...u), new THREE.Vector3(...f));
        mesh.quaternion.setFromRotationMatrix(tmpM);
        mesh.scale.set(1.15, 0.62, 0.78);
        continue;
      }
      const mid = lerp3(a, b, 0.5);
      mesh.position.set(mid[0], mid[1], mid[2]);
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const l = d.length();
      mesh.quaternion.setFromUnitVectors(Y, d.normalize());
      mesh.scale.set(1, Math.max(0.2, l / len), 1);
    }
    // peito: volume mais largo logo abaixo dos ombros
    const c = sk.j.chest;
    this.chestMesh.position.set(
      c[0] - u[0] * 0.13 - f[0] * 0.01,
      c[1] - u[1] * 0.13 - f[1] * 0.01,
      c[2] - u[2] * 0.13 - f[2] * 0.01,
    );
    tmpM.makeBasis(new THREE.Vector3(...s), new THREE.Vector3(...u), new THREE.Vector3(...f));
    this.chestMesh.quaternion.setFromRotationMatrix(tmpM);
    this.chestMesh.scale.set(1.25, 0.95, 0.78);
    for (const { j, mesh } of this.jointMeshes) mesh.position.copy(toV(sk.j[j]));
    this.head.position.copy(toV(sk.j.head));
    const hd = new THREE.Vector3(
      sk.j.head[0] - sk.j.neck[0],
      sk.j.head[1] - sk.j.neck[1],
      sk.j.head[2] - sk.j.neck[2],
    ).normalize();
    const hf = new THREE.Vector3(...f)
      .sub(hd.clone().multiplyScalar(hd.dot(new THREE.Vector3(...f))))
      .normalize();
    const hs = new THREE.Vector3().crossVectors(hd, hf);
    tmpM.makeBasis(hs, hd, hf);
    this.head.quaternion.setFromRotationMatrix(tmpM);
  }
}

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
