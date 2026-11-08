"""As animações compostas dos bichos de estimação (cachorros e gatos), para o motor de `bichos_estimacao_anim.py`.

Cada clipe é uma função fn(t, rig) → intenções, com id, rótulo, laço e duração. Os estados (sentado, deitado, dormindo,
barriga para cima) ficam em laço no próprio estado, como o `deitar` e o `dormir` antigos do Doberman; os gestos começam
e terminam em pé, na pose de descanso.
"""
import math

import numpy as np

from bichos_estimacao_anim import chaves, soma, onda, janela, suave, PERNAS

_CACHE = {}


def _chave(rig, nome):
    return (id(rig), nome)


# ---------------------------------------------------------------- poses-base
def respira(t, amp=1.0, freq=0.5):
    return {"costas.pitch": 1.2 * amp * onda(t, freq), "lombar.pitch": -0.6 * amp * onda(t, freq)}


def _junta(rig, P, perna):
    return P[rig.i(rig.p["pernas"][perna]["ik"][0])]


def pose_sentado(rig, gato=False):
    """Sentado: o corpo gira em volta do quadril até os ombros ficarem na altura de pé (pernas da frente quase
    esticadas), o quadril desce até a garupa encostar no chão, as patas de trás vêm para baixo do quadril e o metatarso
    deita (o jarrete no chão)."""
    k = _chave(rig, "sentado%d" % gato)
    if k in _CACHE:
        return _CACHE[k]
    meta_t = 80.0
    zq = 0.32 * rig.h
    alvo_ombro = rig.hf * (0.93 if not gato else 1.0)
    costas = 18.0 if gato else 4.0
    # corpo longo e baixo (salsicha): a lombar dobra para a garupa (e não a barriga) encostar no chão
    lombar = float(np.clip(48 * (1 - (rig.hf / rig.comp) / 0.85), 0, 32)) if not gato else 0.0
    fr, frt, yq = 0.0, 0.0, rig.quadril[1]
    s = np.clip((alvo_ombro - zq) / rig.comp, -0.95, 0.95)
    th = math.degrees(math.asin(s))
    for _ in range(7):
        fr = 0.45 * rig.comp * (1 - math.cos(math.radians(th))) / rig.h
        # a bola da pata de trás: o jarrete fica logo atrás da junta do quadril, o metatarso deitado para a frente
        yb = yq + 0.08 * rig.h - rig.lm["te"]
        frt = (rig.T0["te"][1] - yb) / rig.h
        q = {"pivo": "quadril", "corpo.pitch": th, "corpo.fr": fr, "apoio": 1.0, "te.meta": meta_t, "td.meta": meta_t,
             "costas.pitch": costas, "te.fr": frt, "td.fr": frt, "lombar.pitch": lombar}
        B, locs, P, W = rig.resolve(dict(q))
        jq = (_junta(rig, P, "te") + _junta(rig, P, "td")) / 2
        zq, yq = float(jq[2]), float(jq[1])
        # a perna da frente tem de alcançar o tornozelo (95% do comprimento): o corpo inclina menos ou mais
        pf = rig.p["pernas"]["fe"]
        tornozelo = rig.H[rig.i(pf["meta"])] if pf["meta"] else rig.T0["fe"]
        d = float(np.linalg.norm(_junta(rig, P, "fe") - tornozelo))
        L = rig.l1["fe"] + rig.l2["fe"]
        th -= 0.85 * math.degrees(math.asin(float(np.clip((d - 0.95 * L) / rig.comp, -0.9, 0.9))))
    q = {"corpo.pitch": th, "corpo.fr": fr, "apoio": 1.0, "te.meta": meta_t, "td.meta": meta_t, "costas.pitch": costas,
         "te.fr": frt, "td.fr": frt, "pescoco.pitch": -th * 0.45 + (8 if gato else 4), "cabeca.pitch": -th * 0.35,
         "cauda.enrola": 35, "lombar.pitch": lombar, "cauda.base": 0.0 if gato else th + 25}
    _CACHE[k] = q
    return q


def pescoco_para(rig, q, z_alvo, nome):
    """O giro do pescoço (para baixo) que leva o ponto mais baixo da cabeça à altura z_alvo, com o resto da pose q."""
    k = _chave(rig, "pescoco_" + nome)
    if k in _CACHE:
        return _CACHE[k]
    lo, hi = -100.0, 10.0
    for _ in range(18):
        m = (lo + hi) / 2
        qq = dict(q)
        qq["pescoco.pitch"] = q.get("pescoco.pitch", 0) + m
        B, locs, P, W = rig._resolve1(qq)
        z = rig.pele(P, W, rig.v_cab)[:, 2].min()
        if z > z_alvo:
            hi = m
        else:
            lo = m
    _CACHE[k] = (lo + hi) / 2
    return _CACHE[k]


def pose_deitado(rig, gato=False):
    """Deitado de esfinge: o corpo desce até a barriga encostar, as patas da frente vão para a frente com o antebraço no
    chão, as de trás dobram com o metatarso deitado."""
    q = {"apoio": 1.0, "corpo.al": -0.9, "corpo.pitch": 4.0 if not gato else 2.0,
         "fe.fr": 0.42, "fd.fr": 0.42, "fe.meta": 92, "fd.meta": 92, "fe.dedo": 0, "fd.dedo": 0,
         "te.meta": 85, "td.meta": 85, "te.fr": 0.32, "td.fr": 0.32, "te.la": 0.12, "td.la": -0.12,
         "pescoco.pitch": 6, "cabeca.pitch": -4}
    return q


SENTA = 0.7  # segundos para sentar ou levantar


# ---------------------------------------------------------------- cachorros
def c_sentar(t, rig):
    S = pose_sentado(rig)
    olha = chaves(t, [(0, {}), (0.8, {"cabeca.yaw": 22, "pescoco.yaw": 8}), (1.6, {"cabeca.yaw": 22, "pescoco.yaw": 8}),
                      (2.2, {}), (2.9, {"cabeca.yaw": -18, "pescoco.yaw": -6, "cabeca.roll": 8}),
                      (3.5, {"cabeca.yaw": -18, "pescoco.yaw": -6, "cabeca.roll": 8}), (4.0, {})])
    return soma(S, olha, respira(t, 1.0, 0.5), {"cauda.lado": 10 * onda(t, 0.5), "cauda.sobe": -25,
                                              "boca": 4 + 3 * onda(t, 1.0), "pivo": 0}) | {"pivo": "quadril"}


def c_abanar(t, rig):
    w = onda(t, 3.0)
    return {"cauda.sobe": 30, "cauda.lado": 42 * w, "lombar.yaw": -5 * w, "corpo.yaw": 2.0 * w, "corpo.roll": 1.5 * w,
            "costas.yaw": 2 * w, "cabeca.roll": 8 * onda(t, 0.5), "cabeca.pitch": 6, "orelhas": 18,
            "boca": 10 + 4 * onda(t, 2.0), "pescoco.pitch": 4 + 2 * onda(t, 1.0)}


def _alvo_corpo(rig, perna, ponto):
    """Deslocamento (la, fr, al em h) do alvo da pata, no corpo em descanso, para chegar ao ponto."""
    d = (np.asarray(ponto) - rig.T0[perna]) / rig.h
    return {perna + ".la": d[0], perna + ".fr": -d[1], perna + ".al": d[2]}


def c_cocar(t, rig):
    S = pose_sentado(rig)
    pp = rig.p
    # o alvo: do lado esquerdo do pescoço, logo atrás da cabeça
    pesc = rig.H[rig.i(pp["pescoco"][-1])]
    cab = rig.H[rig.i(pp["cabeca"])]
    alvo = pesc * 0.5 + cab * 0.2 + rig.centro * 0.3
    alvo = alvo + np.array([0.32 * rig.h, 0, -0.12 * rig.h])
    A = _alvo_corpo(rig, "te", alvo)
    sobe = janela(t, 0.5, 3.0, 0.4)
    coca = 0.07 * onda(t, 5.0) * janela(t, 0.8, 2.7, 0.15)
    q = dict(S)
    q.update({"pivo": "quadril", "te.corpo": sobe, "te.meta": S["te.meta"] * (1 - sobe) - 10 * sobe,
              "te.la": A["te.la"] * sobe, "te.fr": S["te.fr"] * (1 - sobe) + (A["te.fr"] + coca) * sobe,
              "te.al": (A["te.al"] + coca) * sobe,
              "pescoco.yaw": 26 * sobe, "pescoco.pitch": S["pescoco.pitch"] - 8 * sobe, "cabeca.roll": 22 * sobe,
              "cabeca.yaw": 10 * sobe, "corpo.roll": 3 * sobe, "orelha_e": 25 * sobe, "boca": 10 * sobe,
              "cauda.sobe": -25})
    q = soma(q, respira(t)) | {"pivo": "quadril"}
    return q


def c_cavar(t, rig):
    entra = janela(t, 0.35, 2.85, 0.35)
    q = _abaixa(rig, entra, 0.3, "cavar", cabeca=35.0, corpo=-14.0)
    q.update({"cauda.sobe": 25, "cauda.lado": 20 * onda(t, 1.0)})
    for perna, fase in (("fe", 0.0), ("fd", 0.5)):
        ph = (t * 2.0 + fase) % 1.0
        if ph < 0.5:  # raspando no chão, para trás
            s = ph / 0.5
            fr, al = 0.32 - 0.5 * s, 0.0
        else:  # no ar, volta para a frente
            s = (ph - 0.5) / 0.5
            fr, al = -0.18 + 0.5 * suave(s), 0.28 * math.sin(math.pi * s)
        q[perna + ".fr"] = fr * entra
        q[perna + ".al"] = al * entra
        q[perna + ".dedo"] = (35 * math.sin(math.pi * s) if ph >= 0.5 else 0) * entra
    return q


def c_uivar(t, rig):
    S = pose_sentado(rig)
    k = chaves(t, [(0, {}), (0.4, {}), (1.2, {"pescoco.pitch": 42, "cabeca.pitch": 24, "boca": 12, "orelhas": 28}),
                   (1.5, {"pescoco.pitch": 46, "cabeca.pitch": 26, "boca": 22, "orelhas": 30}),
                   (3.0, {"pescoco.pitch": 48, "cabeca.pitch": 28, "boca": 20, "orelhas": 30}),
                   (3.6, {"pescoco.pitch": 10, "cabeca.pitch": 4, "boca": 2}), (4.0, {})])
    vib = 2.0 * onda(t, 6.0) * janela(t, 1.5, 3.0, 0.2)
    return soma(S, k, respira(t, 1.6, 0.5), {"boca": vib, "cauda.sobe": -25}) | {"pivo": "quadril"}


def c_farejar(t, rig):
    entra = janela(t, 0.6, 3.4, 0.5)
    q = _abaixa(rig, entra, 0.06, "farejar", cabeca=38.0, corpo=-16.0)
    q.update({"cabeca.pitch": q["cabeca.pitch"] + 3 * onda(t, 5.0) * entra,
              "pescoco.yaw": 24 * math.sin(2 * math.pi * (t - 0.6) / 2.8) * entra,
              "cabeca.roll": 8 * math.sin(2 * math.pi * (t - 0.6) / 2.8) * entra,
              "cauda.sobe": 12, "cauda.lado": 15 * onda(t, 1.0), "fd.fr": -0.02 * entra})
    return q


def c_pular(t, rig):
    ph = (t % 1.0)
    k = chaves(ph, [(0, {}), (0.22, {"corpo.al": -0.12, "corpo.pitch": -4, "te.meta": 15, "td.meta": 15}),
                    (0.45, {"corpo.al": 0.16, "corpo.pitch": 34, "fe.corpo": 1, "fd.corpo": 1, "fe.al": 0.22, "fd.al": 0.22,
                            "fe.fr": 0.1, "fd.fr": 0.1, "fe.meta": -35, "fd.meta": -35, "te.al": 0.05, "td.al": 0.05,
                            "cabeca.pitch": 10, "pescoco.pitch": -10}),
                    (0.7, {"corpo.al": 0.0, "corpo.pitch": 6, "fe.corpo": 0.2, "fd.corpo": 0.2}),
                    (0.85, {"corpo.al": -0.06, "corpo.pitch": -3}), (1.0, {})])
    return soma(k, {"cauda.sobe": 35, "cauda.lado": 40 * onda(t, 4.0), "boca": 16, "orelhas": 24}) | {"pivo": "quadril"}


def _abaixa(rig, entra, z_alvo, nome, cabeca=45.0, corpo=-18.0):
    q0 = {"pivo": "quadril", "corpo.pitch": corpo, "costas.pitch": -12, "cabeca.pitch": cabeca,
          "fe.fr": -0.1, "fd.fr": -0.1, "orelhas": -6}
    pz = pescoco_para(rig, q0, z_alvo * rig.h, nome)
    q = {k: (v * entra if not isinstance(v, str) else v) for k, v in q0.items()}
    q["pescoco.pitch"] = pz * entra
    return q


def _abaixa_tigela(rig, entra):
    return _abaixa(rig, entra, 0.2, "tigela")


def c_beber(t, rig):
    entra = janela(t, 0.6, 2.9, 0.5)
    q = _abaixa_tigela(rig, entra)
    lambe = janela(t, 0.8, 2.7, 0.15)
    q.update({"boca": (5 + 7 * abs(onda(t, 3.0))) * lambe, "cabeca.pitch": q["cabeca.pitch"] + 3 * onda(t, 3.0) * lambe,
              "cauda.sobe": 5, "cauda.lado": 10 * onda(t, 0.7)})
    return q


def c_comer(t, rig):
    entra = janela(t, 0.6, 3.4, 0.5)
    q = _abaixa_tigela(rig, entra)
    mastiga = janela(t, 0.8, 3.2, 0.15)
    q.update({"boca": (2 + 12 * max(onda(t, 1.6), 0)) * mastiga,
              "pescoco.pitch": q["pescoco.pitch"] + 6 * max(onda(t, 0.8), 0) * mastiga,
              "cabeca.yaw": 5 * onda(t, 0.8) * mastiga, "cauda.sobe": 8, "cauda.lado": 18 * onda(t, 1.2)})
    return q


# buscar: corre em volta (sai para a frente, faz a curva, volta pelo lado e faz a curva até o lugar de partida)
def _pista(rig, segundos):
    D, rr = 4.0 * rig.h, 1.2 * rig.h
    L = 2 * D + 2 * math.pi * rr
    ta, td = 0.5, 0.8
    v = L / (segundos - 0.5 * ta - 0.5 * td)
    return D, rr, L, ta, td, v


def _pista_pos(rig, s, D, rr):
    """Posição (x, y) e rumo (graus, 0 = −Y) no comprimento s da pista."""
    arco = math.pi * rr
    if s < D:
        return np.array([0.0, -s]), 0.0
    s -= D
    if s < arco:  # curva para a esquerda do bicho (+X)
        a = s / rr
        c = np.array([rr, -D])
        return c + rr * np.array([-math.cos(a), -math.sin(a)]), math.degrees(a)
    s -= arco
    if s < D:
        return np.array([2 * rr, -D + s]), 180.0
    s -= D
    a = min(s / rr, math.pi)
    c = np.array([rr, 0.0])
    return c + rr * np.array([math.cos(a), math.sin(a)]), 180.0 + math.degrees(a)


def c_buscar_fn(segundos):
    def fn(t, rig):
        D, rr, L, ta, td, v = _pista(rig, segundos)
        if t < ta:
            s = 0.5 * v * t * t / ta
            vel = v * t / ta
        elif t < segundos - td:
            s = 0.5 * v * ta + v * (t - ta)
            vel = v
        else:
            r = max(segundos - t, 0)
            s = L - 0.5 * v * r * r / td
            vel = v * r / td
        p, rumo = _pista_pos(rig, min(s, L), D, rr)
        curva = (D <= s < D + math.pi * rr) or (s >= 2 * D + math.pi * rr)
        inclina = -min(vel * vel / (9.8 * rr), 1.0) * 6 if curva else 0.0
        bola = janela(t, segundos * 0.35, segundos * 0.9, 0.2)
        q = {"pivo": "chao", "corpo.yaw": rumo, "corpo.la": p[0] / rig.h, "corpo.fr": -p[1] / rig.h,
             "corpo.roll": -inclina, "cauda.sobe": 18, "orelhas": 20, "boca": 14 * bola, "pescoco.pitch": 4 * bola}
        for k in PERNAS:
            q[k + ".fk"] = 1
        return q
    return fn


def mistura(base, w):
    """A pose da animação do pacote misturada com a de descanso (w = 0: descanso; 1: a animação)."""
    out = {}
    for nome, (qt, lc) in base.items():
        q1 = np.array(qt, float)
        if q1[0] < 0:
            q1 = -q1
        q0 = np.array([1.0, 0, 0, 0])
        qq = q0 * (1 - w) + q1 * w
        out[nome] = (qq / np.linalg.norm(qq), np.array(lc) * w)
    return out


def base_corrida(acao, quadros, segundos, amostra, fps_acao=24):
    """Função do tempo → pose do ciclo de corrida (do pacote), entrando e saindo suave."""
    f0, f1 = quadros

    def fn(t):
        f = f0 + ((t * fps_acao) % (f1 - f0))
        w = janela(t, 0.45, segundos - 0.6, 0.45)
        return mistura(amostra(acao, f), w)
    return fn


# ---------------------------------------------------------------- comuns a cachorros e gatos (os 8 antigos do Doberman)
def _passo(t, a, dur):
    """Progresso (0→1) e altura (0→1→0) de um passo que começa em a e dura dur."""
    u = min(max((t - a) / dur, 0.0), 1.0)
    return suave(u), math.sin(math.pi * u) if 0 < u < 1 else 0.0


def g_virar_fn(seg, gato=False):
    """Uma volta inteira no lugar, em passos (as patas plantadas não deslizam; cada uma dá 6 passos)."""
    def fn(t, rig):
        n = 6
        a0, a1 = 0.2, seg - 0.2
        c = (a1 - a0) / (n + 0.25)
        psi = 360.0 * suave((t - a0) / (a1 - a0)) if t > a0 else 0.0
        q = {"pivo": "chao", "chao.pivo": "chao", "corpo.yaw": psi, "cabeca.yaw": 14 * janela(t, a0 + 0.2, a1 - 0.2, 0.3),
             "cauda.sobe": 35 if gato else 15, "cauda.lado": -20 * janela(t, a0, a1, 0.3)}
        for k, o in (("fd", 0.0), ("te", 0.25), ("fe", 0.5), ("td", 0.75)):
            yaw, al = 0.0, 0.0
            for j in range(n):
                u, h = _passo(t, a0 + (j + o) * c, 0.55 * c)
                yaw += 360.0 / n * u
                al = max(al, h)
            q[k + ".yaw"] = yaw
            q[k + ".al"] = 0.16 * al
            q[k + ".meta"] = -12 * al
        return q
    return fn


def _latido(t, tk, dur=0.22):
    return math.sin(math.pi * (t - tk) / dur) if tk <= t <= tk + dur else 0.0


def g_latir(t, rig):
    b = sum(_latido(t, tk) for tk in (0.3, 0.72, 1.14))
    return {"boca": 26 * b, "pescoco.pitch": 4 + 7 * b, "cabeca.pitch": 4 * b, "corpo.fr": -0.03 * b,
            "corpo.pitch": 2 * b, "pivo": "quadril", "orelhas": -10 * b, "cauda.sobe": 25, "cauda.lado": 12 * onda(t, 2.0),
            "fe.meta": -3 * b, "fd.meta": -3 * b}


def _tamanho_reverencia(rig):
    """O quanto o corpo inclina para os cotovelos chegarem no chão (reverência de brincar)."""
    l1 = rig.l1["fe"]
    return -math.degrees(math.asin(min(max((rig.hf - 1.15 * l1) / rig.comp, 0.1), 0.9)))


def g_brincar(t, rig):
    """Pedir para brincar: reverência (frente no chão, traseiro para cima), pulinhos, cauda abanando."""
    th = _tamanho_reverencia(rig)
    k = chaves(t, [(0, {}), (0.5, {"corpo.pitch": th, "fe.fr": 0.42, "fd.fr": 0.42, "fe.meta": 85, "fd.meta": 85,
                                   "costas.pitch": -4, "pescoco.pitch": 22, "cabeca.pitch": 8}),
                   (2.3, {"corpo.pitch": th, "fe.fr": 0.42, "fd.fr": 0.42, "fe.meta": 85, "fd.meta": 85,
                          "costas.pitch": -4, "pescoco.pitch": 22, "cabeca.pitch": 8}),
                   (2.6, {"corpo.al": 0.06, "corpo.pitch": 6}), (3.0, {})])
    pula = janela(t, 0.7, 2.1, 0.15)
    return soma(k, {"corpo.al": 0.05 * abs(onda(t, 1.6)) * pula, "cabeca.roll": 14 * onda(t, 0.5) * pula,
                    "cauda.sobe": 40, "cauda.lado": 40 * onda(t, 3.0), "boca": 14, "orelhas": 15}) | {"pivo": "quadril"}


def _sobe_pata(rig, perna, w, fr=0.35, al=0.5, meta=-25):
    return {perna + ".corpo": w, perna + ".fr": fr * w, perna + ".al": al * w, perna + ".meta": meta * w}


def g_pata_fn(gato=False):
    """Dar a pata, sentado (estado: fica sentado e a pata sobe, espera e desce)."""
    def fn(t, rig):
        S = pose_sentado(rig, gato)
        w = janela(t, 0.7, 2.2, 0.5)
        sac = 0.04 * onda(t, 3.0) * janela(t, 0.9, 2.0, 0.2)
        q = soma(S, _sobe_pata(rig, "fd", w, 0.42 + sac, 0.45), respira(t),
                 {"cabeca.roll": 14 * w, "corpo.roll": 4 * w, "cauda.sobe": -20, "cauda.lado": 45 if gato else 0,
                  "cauda.ondula": 5 if gato else 0, "cauda.fase": 360 * t})
        return q | {"pivo": "quadril"}
    return fn


def _encolhe(w, gato=False):
    """As patas recolhidas junto à barriga (no referencial do corpo), para rolar e para a barriga para cima."""
    q = {}
    for k, fr, al, meta in (("fe", -0.05, 0.42, -55), ("fd", -0.05, 0.42, -55), ("te", 0.32, 0.36, 40),
                            ("td", 0.32, 0.36, 40)):
        q[k + ".corpo"] = w
        q[k + ".fr"] = fr * w
        q[k + ".al"] = al * w
        q[k + ".meta"] = meta * w
        q[k + ".la"] = (0.06 if k.endswith("e") else -0.06) * w
    return q


def g_deitar_fn(gato=False):
    def fn(t, rig):
        D = pose_deitado(rig, gato)
        olha = chaves(t, [(0, {}), (1.0, {"cabeca.yaw": 25, "pescoco.yaw": 10}), (2.0, {"cabeca.yaw": 25, "pescoco.yaw": 10}),
                          (2.6, {}), (3.4, {"cabeca.roll": -10, "pescoco.pitch": -6}), (4.0, {})])
        return soma(D, olha, respira(t), {"cauda.sobe": -20, "cauda.lado": (35 if gato else 10) + 10 * onda(t, 0.5),
                                          "cauda.ondula": 6 if gato else 0, "cauda.fase": 180 * t}) | {"pivo": "centro"}
    return fn


def g_barriga_fn(gato=False):
    """Barriga para cima (estado): de costas, meio de lado, patas recolhidas no ar, rebolando."""
    def fn(t, rig):
        q = soma({"apoio": 1.0, "corpo.al": -0.5, "corpo.roll": 155 + 10 * onda(t, 0.67)}, _encolhe(1.0, gato),
                 {"fe.al": 0.08 * onda(t, 1.33), "fd.al": -0.08 * onda(t, 1.33), "te.al": 0.06 * onda(t, 1.33, 1.0),
                  "pescoco.pitch": -22, "cabeca.roll": 20, "cabeca.pitch": -12, "boca": 0 if gato else 14,
                  "cauda.lado": 30 * onda(t, 1.33), "orelhas": 20, "costas.yaw": 8 * onda(t, 0.67)})
        return q | {"pivo": "centro"}
    return fn


def g_dormir_fn(gato=False):
    """Dormir (estado). Cachorro: deitado com o queixo nas patas. Gato: enrolado, a cabeça encostada na cauda."""
    def fn(t, rig):
        if gato:  # deitado de lado (sobre o lado esquerdo), enrolado para o lado da barriga
            D = soma({"apoio": 1.0, "corpo.al": -0.5, "corpo.roll": 72}, _encolhe(1.0, True),
                     {"fe.fr": 0.12, "fd.fr": 0.18, "te.fr": 0.12, "td.fr": 0.2, "fe.al": -0.12, "fd.al": -0.05,
                      "costas.pitch": -42, "costas.yaw": 6, "cabeca.roll": -10,
                      "cauda.sobe": -50, "cauda.enrola": -110, "cauda.lado": 12, "orelhas": 10})
        else:
            D = dict(pose_deitado(rig, gato))
        D["pescoco.pitch"] = -42 if gato else 0
        D["cabeca.pitch"] = -18 if gato else 8
        pz = 0.0 if gato else pescoco_para(rig, D, 0.05 * rig.h, "dormir%d" % gato)
        D["pescoco.pitch"] = D["pescoco.pitch"] if gato else pz
        r = 0.6 * onda(t, 0.25)
        return soma(D, {"costas.pitch": 1.5 * r, "corpo.al": 0.0, "orelhas": 18 + 2 * r,
                        "cauda.ondula": 3 if gato else 0, "cauda.fase": 90 * t}) | {"pivo": "centro"}
    return fn


def g_cambalhota_fn(seg, gato=False):
    """Rolar no chão: de sentado deita, rola uma volta inteira de costas e volta a sentar."""
    def fn(t, rig):
        S, D = pose_sentado(rig, gato), pose_deitado(rig, gato)
        q = chaves(t, [(0, S), (0.8, D), (seg - 0.9, D), (seg, S)])
        rola = 360.0 * suave((t - 1.0) / (seg - 2.2)) if t > 1.0 else 0.0
        w = janela(t, 1.25, seg - 1.45, 0.3)
        q = soma({k: v * (1 - w) for k, v in q.items()}, {"apoio": 1.0 * w, "corpo.al": -0.5 * w},
                 _encolhe(w, gato), {"corpo.roll": rola, "pescoco.pitch": 8 * w, "cauda.sobe": -15})
        q["apoio"] = 1.0
        return q | {"pivo": "centro"}
    return fn


# ---------------------------------------------------------------- gatos
def gato_cauda_em_pe(t, amp=1.0):
    return {"cauda.sobe": 62, "cauda.enrola": 30, "cauda.ondula": 6 * amp, "cauda.atraso": 50, "cauda.fase": 200 * t}


def gt_miar(t, rig):
    k = chaves(t, [(0, {}), (0.3, {"pescoco.pitch": 10, "cabeca.pitch": 8, "boca": 4}),
                   (0.65, {"pescoco.pitch": 14, "cabeca.pitch": 12, "boca": 24, "orelhas": 8}),
                   (1.0, {"pescoco.pitch": 10, "cabeca.pitch": 8, "boca": 8}), (1.3, {"boca": 0}),
                   (1.6, {"pescoco.pitch": 8, "cabeca.pitch": 6, "boca": 4}),
                   (1.9, {"pescoco.pitch": 10, "cabeca.pitch": 8, "boca": 18}), (2.4, {})])
    return soma(k, gato_cauda_em_pe(t), respira(t)) | {"pivo": "quadril"}


def gt_sentar(t, rig):
    S = pose_sentado(rig, True)
    olha = chaves(t, [(0, {}), (0.9, {"cabeca.yaw": 25, "pescoco.yaw": 6}), (1.8, {"cabeca.yaw": 25, "pescoco.yaw": 6}),
                      (2.4, {}), (3.0, {"cabeca.yaw": -16, "cabeca.roll": 10}), (3.5, {"cabeca.yaw": -16, "cabeca.roll": 10}),
                      (4.0, {})])
    return soma(S, olha, respira(t), {"cauda.sobe": -20, "cauda.lado": 75, "cauda.ondula": 7, "cauda.atraso": 40,
                                      "cauda.fase": 180 * t}) | {"pivo": "quadril"}


def gt_brincar(t, rig):
    """Brincar com a patinha (sentado): olha para baixo e dá tapinhas rápidos para a frente."""
    S = pose_sentado(rig, True)
    q = soma(S, respira(t), {"pescoco.pitch": -12, "cabeca.pitch": -16, "orelhas": -8, "cauda.sobe": -20,
                             "cauda.lado": 60, "cauda.ondula": 14, "cauda.atraso": 45, "cauda.fase": 500 * t})
    for perna, tapas in (("fd", (0.35, 1.05, 2.1)), ("fe", (1.55,))):
        w = 0.0
        frx, alx = 0.0, 0.0
        for tk in tapas:
            u = (t - tk) / 0.45
            if 0 <= u <= 1:
                w = max(w, math.sin(math.pi * u))
                frx = 0.2 + 0.35 * math.sin(math.pi * min(u * 1.6, 1.0))
                alx = 0.45 * math.sin(math.pi * u) - 0.1 * max(0, math.sin(math.pi * (u - 0.4) / 0.6))
        q = soma(q, _sobe_pata(rig, perna, w, frx, alx, -30))
        q[perna + ".corpo"] = w
    q["cabeca.yaw"] = -8 * janela(t, 0.3, 2.6, 0.2)
    return q | {"pivo": "quadril"}


def gt_espreguicar(t, rig):
    frente = {"corpo.pitch": -24, "costas.pitch": -12, "fe.fr": 0.6, "fd.fr": 0.6, "fe.meta": 80, "fd.meta": 80,
              "pescoco.pitch": 20, "cabeca.pitch": 10, "cauda.sobe": 55, "cauda.enrola": 10, "orelhas": 18}
    boceja = dict(frente, boca=28)
    tras = {"corpo.fr": 0.14, "corpo.pitch": 4, "costas.pitch": 6, "te.fr": -0.4, "te.al": 0.06, "te.meta": -35,
            "cauda.sobe": 50, "pescoco.pitch": 4}
    k = chaves(t, [(0, {}), (0.9, frente), (1.4, boceja), (1.9, boceja), (2.4, frente), (2.9, {}), (3.5, tras),
                   (4.1, tras), (4.6, {}), (5.0, {})])
    return soma(k, {"cauda.sobe": 30}) | {"pivo": "quadril"}


def gt_lamber(t, rig):
    """Lamber a pata (sentado): a pata da frente direita sobe até a boca e a cabeça lambe."""
    S = pose_sentado(rig, True)
    pp = rig.p
    alvo = rig.H[rig.i(pp["mandibula"])] * 0.85 + rig.ombro * 0.15 + np.array([-0.1 * rig.h, 0.05 * rig.h, -0.12 * rig.h])
    A = _alvo_corpo(rig, "fd", alvo)
    w = janela(t, 0.5, 3.0, 0.45)
    lambe = janela(t, 0.8, 2.8, 0.15)
    q = dict(S)
    q.update({"fd.corpo": w, "fd.la": A["fd.la"] * w, "fd.fr": A["fd.fr"] * w, "fd.al": A["fd.al"] * w,
              "fd.meta": -70 * w, "fd.dedo": -40 * w, "fd.ombro": 25 * w,
              "pescoco.pitch": S["pescoco.pitch"] - 20 * w + 4 * onda(t, 3.0) * lambe,
              "cabeca.pitch": S["cabeca.pitch"] - 22 * w, "cabeca.yaw": -18 * w, "cabeca.roll": -12 * w,
              "boca": (6 + 9 * abs(onda(t, 3.0))) * lambe, "cauda.sobe": -20, "cauda.lado": 75})
    return soma(q, respira(t)) | {"pivo": "quadril"}


def gt_pular(t, rig):
    """Pulo no lugar: agacha, rebola, salta com as pernas de trás esticadas e cai nas da frente."""
    ag = {"corpo.al": -0.28, "corpo.pitch": -4, "te.meta": 35, "td.meta": 35, "fe.meta": 20, "fd.meta": 20,
          "cauda.sobe": 10}
    ar = {"corpo.al": 1.15, "corpo.pitch": 8, "te.corpo": 1, "td.corpo": 1, "fe.corpo": 1, "fd.corpo": 1,
          "te.fr": -0.3, "td.fr": -0.3, "te.al": 0.05, "td.al": 0.05, "te.meta": -35, "td.meta": -35,
          "fe.fr": 0.12, "fd.fr": 0.12, "fe.al": 0.22, "fd.al": 0.22, "fe.meta": -50, "fd.meta": -50,
          "pescoco.pitch": 6, "cauda.sobe": 20}
    k = chaves(t, [(0, {}), (0.45, ag), (0.58, ag), (0.72, dict(ar, **{"corpo.al": 0.5, "corpo.pitch": 22})),
                   (0.9, ar), (1.1, {"corpo.al": 0.05, "corpo.pitch": -10, "te.corpo": 0.5, "td.corpo": 0.5,
                                     "te.fr": -0.1, "td.fr": -0.1}),
                   (1.3, {"corpo.al": -0.15, "corpo.pitch": -2, "te.meta": 20, "td.meta": 20, "fe.meta": 15,
                          "fd.meta": 15}), (1.8, {})])
    reb = 3 * onda(t, 4.0) * janela(t, 0.3, 0.55, 0.1)
    return soma(k, {"corpo.yaw": reb, "lombar.yaw": -reb}) | {"pivo": "quadril"}


def gt_esfregar(t, rig):
    """Esfregar-se (numa perna, num móvel): o corpo encosta de lado, a bochecha esfrega, a cauda em gancho."""
    f = 1.0 / 3.0
    ida = 0.5 - 0.5 * math.cos(2 * math.pi * f * t * 2)
    q = {"corpo.la": 0.08 * ida, "corpo.roll": 10 * ida, "corpo.yaw": 7 * math.sin(2 * math.pi * f * t),
         "pescoco.yaw": 22 * ida, "cabeca.roll": 24 * ida, "cabeca.yaw": 10 * ida, "pescoco.pitch": -6 * ida,
         "orelhas": 14 * ida, "costas.yaw": 8 * ida, "pivo": "centro"}
    return soma(q, gato_cauda_em_pe(t, 1.6), {"cauda.enrola": 25}) | {"pivo": "centro"}


CLIPES_GATO = [
    ("virar", "Virar", True, 2.6, g_virar_fn(2.6, True)),
    ("latir", "Miar (o mesmo que miar)", True, 2.4, gt_miar),
    ("brincar", "Brincar (patinha)", True, 3.0, gt_brincar),
    ("pata", "Dar a pata", True, 3.0, g_pata_fn(True)),
    ("cambalhota", "Cambalhota (rolar no chão)", True, 4.5, g_cambalhota_fn(4.5, True)),
    ("deitar", "Deitar", True, 4.0, g_deitar_fn(True)),
    ("barriga", "Barriga para cima", True, 3.0, g_barriga_fn(True)),
    ("dormir", "Dormir enrolado", True, 4.0, g_dormir_fn(True)),
    ("sentar", "Sentar", True, 4.0, gt_sentar),
    ("espreguicar", "Espreguiçar", True, 5.0, gt_espreguicar),
    ("lamber_pata", "Lamber a pata", True, 3.5, gt_lamber),
    ("miar", "Miar", True, 2.4, gt_miar),
    ("pular", "Pular", True, 1.8, gt_pular),
    ("esfregar", "Esfregar-se", True, 3.0, gt_esfregar),
]


# o catálogo dos clipes novos dos cachorros: id, rótulo, laço, segundos, função (None: buscar, que usa a corrida)
CLIPES_CACHORRO = [
    ("sentar", "Sentar", True, 4.0, c_sentar),
    ("abanar", "Abanar o rabo", True, 2.0, c_abanar),
    ("cocar", "Coçar a orelha", True, 3.5, c_cocar),
    ("cavar", "Cavar", True, 3.2, c_cavar),
    ("uivar", "Uivar", True, 4.0, c_uivar),
    ("farejar", "Farejar o chão", True, 4.0, c_farejar),
    ("buscar", "Buscar (correr e voltar)", False, 4.5, None),
    ("pular", "Pular de alegria", True, 2.0, c_pular),
    ("beber", "Beber água", True, 3.5, c_beber),
    ("comer", "Comer na tigela", True, 4.0, c_comer),
]


# o Dog_001 (border collie): as 8 antigas do Doberman compostas aqui + as 10 novas
CLIPES_DOG001 = [
    ("virar", "Virar", True, 3.0, g_virar_fn(3.0)),
    ("latir", "Latir", True, 2.0, g_latir),
    ("brincar", "Pedir para brincar", True, 3.0, g_brincar),
    ("pata", "Dar a pata", True, 3.0, g_pata_fn()),
    ("cambalhota", "Cambalhota", True, 4.5, g_cambalhota_fn(4.5)),
    ("deitar", "Deitar", True, 4.0, g_deitar_fn()),
    ("barriga", "Barriga para cima", True, 3.0, g_barriga_fn()),
    ("dormir", "Dormir", True, 4.0, g_dormir_fn()),
] + CLIPES_CACHORRO
