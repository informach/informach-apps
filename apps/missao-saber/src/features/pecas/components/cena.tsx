"use client";
import { Bounds, Edges, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { celulasNaPose, giros3, partesNaPose, verticesNaPose } from "../geometria";
import {
  type Desafio,
  ehMalha,
  type Montagem,
  type PecaPlana as PecaPlanaTipo,
  type Ponto,
  type PosePlana,
  type PoseSolida,
  type Vetor3,
} from "../tipos";

/*
 * Coordenadas: o quebra-cabeça usa (x, y, z) com z para cima; a cena usa
 * (x, z, -y), uma rotação própria (sem espelhar), para o y do desafio
 * apontar para cima na tela quando a câmera olha a mesa de cima.
 */
const mundo = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

const ESPESSURA_PLANA = 0.4;
const ESPESSURA_LIVRE = 0.25;

type Props = {
  desafio: Desafio;
  montagem: Montagem;
  selecionada: string | null;
  bloqueada: boolean;
  aoSelecionar: (id: string) => void;
  aoArrastar: (id: string, x: number, y: number) => void;
  aoSoltar: (id: string) => void;
};

export default function Cena(props: Props) {
  const { desafio } = props;
  const plano = desafio.tipo === "malha-plano" || desafio.tipo === "livre-plano";
  const [arrastando, setArrastando] = useState(false);
  const centro = useMemo(() => centroDoAlvo(desafio), [desafio]);
  return (
    <Canvas
      orthographic={plano}
      dpr={[1, 2]}
      camera={
        plano
          ? { position: [centro.x, 40, centro.z + 14], zoom: 40, near: 0.1, far: 200 }
          : { position: [centro.x + 7, 8, centro.z + 9], fov: 40, near: 0.1, far: 200 }
      }
      style={{ touchAction: "none" }}
      aria-hidden="true"
    >
      <color attach="background" args={["#ECE6D3"]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[6, 14, 8]} intensity={1.6} />
      <directionalLight position={[-8, 6, -4]} intensity={0.5} />
      {!plano && (
        <OrbitControls
          makeDefault
          enabled={!arrastando}
          enablePan={false}
          target={centro}
          minDistance={4}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      )}
      {plano ? (
        <>
          <EnquadrarPlano desafio={desafio} montagem={props.montagem} />
          <Alvo desafio={desafio} />
          <Pecas {...props} aoArrastando={setArrastando} />
        </>
      ) : (
        <Bounds fit clip margin={1.15}>
          <Alvo desafio={desafio} />
          <Pecas {...props} aoArrastando={setArrastando} />
        </Bounds>
      )}
    </Canvas>
  );
}

/**
 * Mesa plana: a câmera fica sobre o centro de tudo (alvo e peças da
 * arrumação inicial), inclinada só para a frente, sem girar a imagem, e o zoom
 * faz caber com folga. Refaz ao mudar o tamanho da tela, não a cada movimento.
 */
function EnquadrarPlano({ desafio, montagem }: { desafio: Desafio; montagem: Montagem }) {
  const { camera, size } = useThree();
  const [caixa] = useState(() => caixaPlana(desafio, montagem));
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const cx = (caixa.x0 + caixa.x1) / 2;
    const cy = (caixa.y0 + caixa.y1) / 2;
    camera.position.set(cx, 40, -cy + 12);
    camera.up.set(0, 1, 0);
    camera.lookAt(cx, 0, -cy);
    const largura = Math.max(caixa.x1 - caixa.x0, 1) * 1.12;
    const altura = Math.max(caixa.y1 - caixa.y0, 1) * 1.18;
    camera.zoom = Math.min(size.width / largura, size.height / altura);
    camera.updateProjectionMatrix();
  }, [camera, size, caixa]);
  return null;
}

function caixaPlana(desafio: Desafio, montagem: Montagem) {
  const pontos: [number, number][] = [];
  if (desafio.tipo === "malha-plano" && montagem.tipo === "malha") {
    for (const c of desafio.alvo) pontos.push([c[0], c[1]], [c[0] + 1, c[1] + 1]);
    for (const peca of desafio.pecas) {
      const pose = montagem.poses[peca.id];
      if (pose)
        for (const c of celulasNaPose(peca, pose, true))
          pontos.push([c[0], c[1]], [c[0] + 1, c[1] + 1]);
    }
  } else if (desafio.tipo === "livre-plano" && montagem.tipo === "livre-plano") {
    for (const p of desafio.alvo.flat()) pontos.push([p[0], p[1]]);
    for (const peca of desafio.pecas) {
      const pose = montagem.poses[peca.id];
      if (pose) for (const p of partesNaPose(peca, pose).flat()) pontos.push([p[0], p[1]]);
    }
    // A moldura da caixa fica fora do alvo.
    if (desafio.modo === "caber") {
      const xs = pontos.map((p) => p[0]);
      const ys = pontos.map((p) => p[1]);
      pontos.push(
        [Math.min(...xs) - 0.4, Math.min(...ys) - 0.4],
        [Math.max(...xs) + 0.4, Math.max(...ys) + 0.4],
      );
    }
  }
  const xs = pontos.map((p) => p[0]);
  const ys = pontos.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function centroDoAlvo(desafio: Desafio) {
  if (ehMalha(desafio)) {
    const xs = desafio.alvo.map((c) => c[0]);
    const ys = desafio.alvo.map((c) => c[1]);
    return mundo(
      (Math.min(...xs) + Math.max(...xs) + 1) / 2,
      (Math.min(...ys) + Math.max(...ys) + 1) / 2,
      0,
    );
  }
  if (desafio.tipo === "livre-plano") {
    const pontos = desafio.alvo.flat();
    const xs = pontos.map((p) => p[0]);
    const ys = pontos.map((p) => p[1]);
    return mundo(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
      0,
    );
  }
  return mundo(0, 0, 0);
}

/* ---------- o alvo: casas, contorno ou caixa ---------- */

function Alvo({ desafio }: { desafio: Desafio }) {
  if (desafio.tipo === "malha-plano")
    return (
      <group>
        {desafio.alvo.map((c) => (
          <mesh key={`${c[0]},${c[1]}`} position={mundo(c[0] + 0.5, c[1] + 0.5, -0.03)}>
            <boxGeometry args={[0.96, 0.06, 0.96]} />
            <meshStandardMaterial color="#FFFDF7" />
          </mesh>
        ))}
      </group>
    );
  if (desafio.tipo === "malha-espaco") {
    const xs = desafio.alvo.map((c) => c[0]);
    const ys = desafio.alvo.map((c) => c[1]);
    const zs = desafio.alvo.map((c) => c[2]);
    const tamanho = [Math.max(...xs) + 1, Math.max(...ys) + 1, Math.max(...zs) + 1] as const;
    return (
      <group>
        <Mesa />
        {desafio.alvo
          .filter((c) => c[2] === 0)
          .map((c) => (
            <mesh key={`${c[0]},${c[1]}`} position={mundo(c[0] + 0.5, c[1] + 0.5, -0.02)}>
              <boxGeometry args={[0.94, 0.04, 0.94]} />
              <meshStandardMaterial color="#FFFDF7" />
            </mesh>
          ))}
        <mesh position={mundo(tamanho[0] / 2, tamanho[1] / 2, tamanho[2] / 2)}>
          <boxGeometry args={[tamanho[0], tamanho[2], tamanho[1]]} />
          <meshBasicMaterial transparent opacity={0.05} color="#6D28D9" depthWrite={false} />
          <Edges color="#6D28D9" />
        </mesh>
      </group>
    );
  }
  if (desafio.tipo === "livre-plano") return <AlvoPlano desafio={desafio} />;
  return <AlvoSolido vertices={desafio.alvo} />;
}

function Mesa({ altura = 0 }: { altura?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, altura - 0.06, 0]}>
      <circleGeometry args={[30, 48]} />
      <meshStandardMaterial color="#E2D9BF" />
    </mesh>
  );
}

function formaDe(poligono: readonly Ponto[]) {
  const forma = new THREE.Shape();
  poligono.forEach((p, i) => {
    if (i === 0) forma.moveTo(p[0], p[1]);
    else forma.lineTo(p[0], p[1]);
  });
  forma.closePath();
  return forma;
}

function AlvoPlano({ desafio }: { desafio: Extract<Desafio, { tipo: "livre-plano" }> }) {
  const geometrias = useMemo(
    () => desafio.alvo.map((parte) => new THREE.ShapeGeometry(formaDe(parte))),
    [desafio],
  );
  const caixa = useMemo(() => {
    if (desafio.modo !== "caber") return null;
    const pontos = desafio.alvo.flat();
    const x0 = Math.min(...pontos.map((p) => p[0]));
    const x1 = Math.max(...pontos.map((p) => p[0]));
    const y0 = Math.min(...pontos.map((p) => p[1]));
    const y1 = Math.max(...pontos.map((p) => p[1]));
    const borda = 0.35;
    return [
      { x: (x0 + x1) / 2, y: y0 - borda / 2, w: x1 - x0 + 2 * borda, h: borda },
      { x: (x0 + x1) / 2, y: y1 + borda / 2, w: x1 - x0 + 2 * borda, h: borda },
      { x: x0 - borda / 2, y: (y0 + y1) / 2, w: borda, h: y1 - y0 },
      { x: x1 + borda / 2, y: (y0 + y1) / 2, w: borda, h: y1 - y0 },
    ];
  }, [desafio]);
  return (
    <group>
      {geometrias.map((g, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: partes fixas do alvo
        <mesh key={i} geometry={g} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <meshStandardMaterial color="#FFFDF7" side={THREE.DoubleSide} />
        </mesh>
      ))}
      {caixa?.map((parede, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: quatro paredes fixas
        <mesh key={i} position={mundo(parede.x, parede.y, 0.2)}>
          <boxGeometry args={[parede.w, 0.4, parede.h]} />
          <meshStandardMaterial color="#C9A86A" />
        </mesh>
      ))}
    </group>
  );
}

function convexo(vertices: readonly Vetor3[]) {
  return new ConvexGeometry(vertices.map((v) => mundo(v[0], v[1], v[2])));
}

function AlvoSolido({ vertices }: { vertices: readonly Vetor3[] }) {
  const geometria = useMemo(() => convexo(vertices), [vertices]);
  const mesaZ = Math.min(...vertices.map((v) => v[2]));
  return (
    <group>
      <Mesa altura={mesaZ} />
      <mesh geometry={geometria}>
        <meshBasicMaterial transparent opacity={0.08} color="#6D28D9" depthWrite={false} />
        <Edges color="#6D28D9" />
      </mesh>
    </group>
  );
}

/* ---------- peças ---------- */

type Arrasto = { id: string; plano: THREE.Plane; dx: number; dy: number };

function Pecas(props: Props & { aoArrastando: (v: boolean) => void }) {
  const { desafio, montagem, selecionada, bloqueada } = props;
  const arrasto = useRef<Arrasto | null>(null);

  const pontoNaMesa = (evento: ThreeEvent<PointerEvent>, plano: THREE.Plane) => {
    const ponto = new THREE.Vector3();
    return evento.ray.intersectPlane(plano, ponto) ? { x: ponto.x, y: -ponto.z } : null;
  };
  const posicaoDa = (id: string) => {
    const pose = montagem.poses[id];
    return pose ? { x: pose.x, y: pose.y } : { x: 0, y: 0 };
  };
  const eventos = (id: string, alturaDoArrasto: number) =>
    bloqueada
      ? {}
      : {
          onPointerDown: (evento: ThreeEvent<PointerEvent>) => {
            evento.stopPropagation();
            props.aoSelecionar(id);
            const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -alturaDoArrasto);
            const ponto = pontoNaMesa(evento, plano);
            if (!ponto) return;
            const pose = posicaoDa(id);
            arrasto.current = { id, plano, dx: pose.x - ponto.x, dy: pose.y - ponto.y };
            (evento.target as Element).setPointerCapture?.(evento.pointerId);
            props.aoArrastando(true);
          },
          onPointerMove: (evento: ThreeEvent<PointerEvent>) => {
            const atual = arrasto.current;
            if (!atual || atual.id !== id) return;
            evento.stopPropagation();
            const ponto = pontoNaMesa(evento, atual.plano);
            if (ponto) props.aoArrastar(id, ponto.x + atual.dx, ponto.y + atual.dy);
          },
          onPointerUp: (evento: ThreeEvent<PointerEvent>) => {
            const atual = arrasto.current;
            if (!atual || atual.id !== id) return;
            (evento.target as Element).releasePointerCapture?.(evento.pointerId);
            arrasto.current = null;
            props.aoArrastando(false);
            props.aoSoltar(id);
          },
        };

  if (ehMalha(desafio) && montagem.tipo === "malha") {
    const plano = desafio.tipo === "malha-plano";
    const altura = plano ? ESPESSURA_PLANA : 0.96;
    return (
      <group>
        {desafio.pecas.map((peca) => {
          const pose = montagem.poses[peca.id];
          if (!pose) return null;
          const celulas = celulasNaPose(peca, pose, plano);
          const base = Math.min(...celulas.map((c) => c[2]));
          return (
            <group key={peca.id} {...eventos(peca.id, plano ? altura / 2 : base + 0.5)}>
              {celulas.map((c, i) => (
                <mesh
                  // biome-ignore lint/suspicious/noArrayIndexKey: a i-ésima casa da peça, que só muda de lugar
                  key={i}
                  position={mundo(c[0] + 0.5, c[1] + 0.5, plano ? altura / 2 : c[2] + 0.5)}
                >
                  <boxGeometry args={[0.98, altura, 0.98]} />
                  <Material cor={peca.cor} selecionada={peca.id === selecionada} />
                </mesh>
              ))}
            </group>
          );
        })}
      </group>
    );
  }
  if (desafio.tipo === "livre-plano" && montagem.tipo === "livre-plano")
    return (
      <group>
        {desafio.pecas.map((peca) => {
          const pose = montagem.poses[peca.id];
          if (!pose) return null;
          return (
            <PecaPlana
              key={peca.id}
              partes={peca.partes}
              pose={pose}
              cor={peca.cor}
              selecionada={peca.id === selecionada}
              eventos={eventos(peca.id, ESPESSURA_LIVRE / 2)}
            />
          );
        })}
      </group>
    );
  if (desafio.tipo === "livre-espaco" && montagem.tipo === "livre-espaco")
    return (
      <group>
        {desafio.pecas.map((peca) => {
          const pose = montagem.poses[peca.id];
          if (!pose) return null;
          const base = Math.min(...verticesNaPose(peca, pose).map((v) => v[2]));
          return (
            <PecaSolida
              key={peca.id}
              vertices={peca.vertices}
              pose={pose}
              cor={peca.cor}
              selecionada={peca.id === selecionada}
              eventos={eventos(peca.id, base + 0.5)}
            />
          );
        })}
      </group>
    );
  return null;
}

function Material({ cor, selecionada }: { cor: string; selecionada: boolean }) {
  return (
    <meshStandardMaterial
      color={cor}
      side={THREE.DoubleSide}
      roughness={0.55}
      emissive={selecionada ? cor : "#000000"}
      emissiveIntensity={selecionada ? 0.35 : 0}
    />
  );
}

/** Geometria criada uma vez, em coordenadas da peça; a pose só move o grupo. */
function PecaPlana({
  partes,
  pose,
  cor,
  selecionada,
  eventos,
}: {
  partes: PecaPlanaTipo["partes"];
  pose: PosePlana;
  cor: string;
  selecionada: boolean;
  eventos: object;
}) {
  const geometrias = useMemo(
    () =>
      partes.map(
        (parte) =>
          new THREE.ExtrudeGeometry(formaDe(parte), {
            depth: ESPESSURA_LIVRE,
            bevelEnabled: false,
          }),
      ),
    [partes],
  );
  useEffect(
    () => () => {
      for (const g of geometrias) g.dispose();
    },
    [geometrias],
  );
  return (
    <group
      position={mundo(pose.x, pose.y, 0)}
      rotation={[0, (pose.angulo * Math.PI) / 180, 0]}
      {...eventos}
    >
      <group scale={[pose.espelho ? -1 : 1, 1, 1]}>
        {geometrias.map((g, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: partes fixas da peça
          <mesh key={i} geometry={g} rotation={[-Math.PI / 2, 0, 0]}>
            <Material cor={cor} selecionada={selecionada} />
            <Edges color={selecionada ? "#17352C" : "#4F6359"} threshold={20} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Giro do desafio (z para cima) levado à base da cena (y para cima). */
function matrizDaPose(pose: PoseSolida) {
  const g = giros3[pose.o] ?? giros3[0];
  if (!g) return new THREE.Matrix4();
  // Na cena, (x, y, z) do desafio vira (x, z, -y): M = P · G · Pᵀ.
  const p = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
  const giro = new THREE.Matrix4().set(
    g[0][0],
    g[0][1],
    g[0][2],
    0,
    g[1][0],
    g[1][1],
    g[1][2],
    0,
    g[2][0],
    g[2][1],
    g[2][2],
    0,
    0,
    0,
    0,
    1,
  );
  const m = p.clone().multiply(giro).multiply(p.clone().transpose());
  m.setPosition(mundo(pose.x, pose.y, pose.z));
  return m;
}

function PecaSolida({
  vertices,
  pose,
  cor,
  selecionada,
  eventos,
}: {
  vertices: readonly Vetor3[];
  pose: PoseSolida;
  cor: string;
  selecionada: boolean;
  eventos: object;
}) {
  const geometria = useMemo(() => convexo(vertices), [vertices]);
  useEffect(() => () => geometria.dispose(), [geometria]);
  const matriz = useMemo(() => matrizDaPose(pose), [pose]);
  return (
    <mesh geometry={geometria} matrix={matriz} matrixAutoUpdate={false} {...eventos}>
      <meshStandardMaterial
        color={cor}
        flatShading
        roughness={0.5}
        emissive={selecionada ? cor : "#000000"}
        emissiveIntensity={selecionada ? 0.3 : 0}
      />
      <Edges color={selecionada ? "#17352C" : "#4F6359"} />
    </mesh>
  );
}
