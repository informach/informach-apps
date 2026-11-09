"""Confere o fechamento dos referenciais do percurso como a página faz (depuração).
Uso: python3 -I morada-art/parque_brinquedos_fechamento.py SP/cidade_out"""
import json, math, sys

def sub(a, b): return [a[i] - b[i] for i in range(3)]
def dot(a, b): return sum(a[i] * b[i] for i in range(3))
def nrm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return [x / l for x in a]
def cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

cat = json.load(open(sys.argv[1] + "/parque_brinquedos/catalogo.json"))
for it in cat["itens"]:
    vistos = set()
    for an in it.get("animacoes", []):
        if an["anima"] != "percurso" or id(an["pontos"]) in vistos:
            continue
        P = an["pontos"] + [an["pontos"][0]]
        key = (it["id"], len(P))
        if key in vistos:
            continue
        vistos.add(key)
        n = len(P)
        T = [nrm(sub(P[min(n - 1, i + 1)], P[max(0, i - 1)])) for i in range(n)]
        ref = [0, 1, 0]
        U = [nrm(sub(ref, [T[0][k] * dot(ref, T[0]) for k in range(3)]))]
        pior = 0.0
        for i in range(1, n):
            u = nrm(sub(U[-1], [T[i][k] * dot(U[-1], T[i]) for k in range(3)]))
            pior = max(pior, math.degrees(math.acos(max(-1, min(1, dot(u, U[-1]))))))
            U.append(u)
        ini = nrm(sub(U[0], [T[-1][k] * dot(U[0], T[-1]) for k in range(3)]))
        erro = math.degrees(math.acos(max(-1, min(1, dot(U[-1], ini)))))
        dmax = max(math.dist(P[i], P[i + 1]) for i in range(n - 1))
        print(f"{it['id']:28s} pontos {n - 1:4d}  passo máx {dmax:.2f} m  giro no fechamento {erro:6.1f}°  "
              f"(repartido: {erro / max(1, n - 1):.3f}°/ponto)  maior giro entre pontos {pior:.1f}°")
