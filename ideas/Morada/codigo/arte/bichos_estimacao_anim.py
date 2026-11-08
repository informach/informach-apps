"""Motor das animações compostas dos bichos de estimação (cachorros e gatos do Morada).

Cada animação é uma função do tempo que devolve as "intenções" da pose (o corpo inclina e desce em volta de um pivô,
as costas, o pescoço, a cabeça, a boca, as orelhas e a cauda giram, e cada pata vai para um alvo no chão ou presa ao
corpo). O motor resolve isso num modelo do esqueleto em numpy:
- FK: matriz de cada osso = pai · (descanso do pai)⁻¹ · descanso · base (a mesma conta do Blender);
- pernas: IK de dois ossos (coxa e canela, ou braço e antebraço) até o tornozelo, com o metatarso numa direção dada
  (em pé, o de descanso; sentado, deitado no chão) e o dedo plano no chão. O joelho dobra para o mesmo lado do descanso;
- chão: a malha (skinning linear com os pesos do bicho) nunca passa de z = 0: o corpo sobe o que for preciso, e cada pata
  que afundar sobe o seu alvo. Com `apoio` = 1 o corpo desce até encostar (deitar, sentar).
Os mesmos movimentos servem para o Doberman (e os cachorros feitos dele), o Dog_001 e o Kitty_001, porque as
distâncias são medidas na altura do quadril de cada um e os papéis dos ossos (raiz, costas, pescoço...) vêm de um mapa.
As patas plantadas não deslizam: o alvo fica parado no chão enquanto o corpo se move.

Os giros são dados em graus, nos eixos do bicho em descanso (frente = −Y, esquerda do bicho = +X, cima = +Z):
`pitch` positivo levanta a frente (o focinho), `yaw` positivo vira para a esquerda do bicho, `roll` positivo tomba o alto
para a esquerda. Distâncias em alturas de quadril (`h`).
"""
import math

import numpy as np

FPS = 24
PASSO = 2  # uma chave a cada 2 quadros

PERNAS = ("te", "td", "fe", "fd")  # trás esquerda/direita, frente esquerda/direita


# ---------------------------------------------------------------- giros
def Rx(g):
    a = math.radians(g)
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def Ry(g):
    a = math.radians(g)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def Rz(g):
    a = math.radians(g)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def giro(pitch=0.0, yaw=0.0, roll=0.0):
    """Giro no referencial do bicho: pitch levanta a frente, yaw vira à esquerda, roll tomba o alto para a esquerda."""
    return Rz(yaw) @ Rx(-pitch) @ Ry(roll)


def rot_min(a, b):
    """O menor giro que leva a direção a até a direção b."""
    a = a / (np.linalg.norm(a) + 1e-12)
    b = b / (np.linalg.norm(b) + 1e-12)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    s = np.linalg.norm(v)
    if s < 1e-9:
        if c > 0:
            return np.eye(3)
        p = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
        k = np.cross(a, p)
        k /= np.linalg.norm(k)
        return 2 * np.outer(k, k) - np.eye(3)
    k = v / s
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + s * K + (1 - c) * (K @ K)


def quat(M):
    """Matriz 3×3 → quatérnio (w, x, y, z)."""
    m = M
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        q = (0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s)
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = ((m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s)
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = ((m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s)
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = ((m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s)
    q = np.array(q)
    return q / np.linalg.norm(q)


def mat_quat(q):
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
                     [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
                     [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


# ---------------------------------------------------------------- mapas de papéis dos esqueletos
def _pernas_dob():
    p = {}
    for lado, s in (("e", "L"), ("d", "R")):
        p["t" + lado] = dict(ombro=None, ik=["Thigh." + s, "Shin." + s], meta="Foot." + s, pata="Toe." + s)
        p["f" + lado] = dict(ombro="Front_Shoulder." + s, ik=["Front_Thigh." + s, "Front_Shin." + s],
                             meta="Front_Foot." + s, pata="Front_Toe." + s)
    return p


def _pernas_animals(meta_frente):
    p = {}
    for lado, s in (("e", "L"), ("d", "R")):
        p["t" + lado] = dict(ombro="shoulder." + s, ik=["thigh." + s, "shin." + s], meta="foot." + s, pata="toe." + s)
        if meta_frente:
            p["f" + lado] = dict(ombro="front_shoulder." + s, ik=["front_thigh." + s, "front_shin." + s],
                                 meta="front_foot." + s, pata="front_toe." + s)
        else:
            p["f" + lado] = dict(ombro="front_shoulder." + s, ik=["front_thigh." + s, "front_shin." + s],
                                 meta=None, pata="front_foot." + s)
    return p


PAPEIS = {
    "doberman": dict(raiz="Spine1", lombar=["Spine"], costas=["Spine2"], pescoco=["Neck", "Neck1"], cabeca="Head",
                     mandibula="Jaw", orelhas=("Ear.L", "Ear.R"), cauda=["Tail"], pernas=_pernas_dob()),
    "kitty": dict(raiz="spine.005", lombar=[], costas=["spine.006", "spine.007"], pescoco=["spine.008"], cabeca="scull",
                  mandibula="jaw", orelhas=("ear.L", "ear.R"),
                  cauda=["spine.004", "spine.003", "spine.002", "spine.001", "spine"], pernas=_pernas_animals(False)),
    "dog001": dict(raiz="spine.004", lombar=[], costas=["spine.005", "spine.006"], pescoco=["spine.007", "spine.008"],
                   cabeca="scull", mandibula="jaw", orelhas=("ear.L", "ear.R"),
                   cauda=["spine.003", "spine.002", "spine.001", "spine"], pernas=_pernas_animals(True)),
}


# ---------------------------------------------------------------- o esqueleto em numpy
class Rig:
    """Esqueleto em descanso (espaço do mundo) + papéis dos ossos + malha (para o chão)."""

    def __init__(self, nomes, pai, H, R, papeis, V=None, Wv=None):
        self.nomes = list(nomes)
        self.n = len(self.nomes)
        self.idx = {n: i for i, n in enumerate(self.nomes)}
        self.pai = list(pai)
        self.H = np.asarray(H, float)
        self.R = np.asarray(R, float)
        self.p = papeis
        feitos, ordem = set(), []
        while len(ordem) < self.n:
            for i in range(self.n):
                if i not in feitos and (self.pai[i] < 0 or self.pai[i] in feitos):
                    ordem.append(i)
                    feitos.add(i)
        self.ordem = ordem
        self.V = None if V is None else np.asarray(V, float)
        self.Wv = None if Wv is None else np.asarray(Wv, float)
        self._medidas()

    def i(self, nome):
        return self.idx[nome]

    def _medidas(self):
        H = self.H
        pr = self.p["pernas"]
        self.T0 = {k: H[self.i(v["pata"])].copy() for k, v in pr.items()}
        self.quadril = (H[self.i(pr["te"]["ik"][0])] + H[self.i(pr["td"]["ik"][0])]) / 2
        self.ombro = (H[self.i(pr["fe"]["ik"][0])] + H[self.i(pr["fd"]["ik"][0])]) / 2
        self.h = float(self.quadril[2])
        self.hf = float(self.ombro[2])
        self.centro = (self.quadril + self.ombro) / 2
        self.comp = float(abs(self.ombro[1] - self.quadril[1]))
        self.lado = {}  # para que lado o joelho dobra (no plano da perna)
        self.l1, self.l2, self.lm = {}, {}, {}
        for k, v in pr.items():
            a, b = self.i(v["ik"][0]), self.i(v["ik"][1])
            c = self.i(v["meta"]) if v["meta"] else self.i(v["pata"])
            self.l1[k] = np.linalg.norm(H[b] - H[a])
            self.l2[k] = np.linalg.norm(H[c] - H[b])
            self.lm[k] = np.linalg.norm(H[self.i(v["pata"])] - H[c]) if v["meta"] else 0.0
            u = (H[c] - H[a]) / np.linalg.norm(H[c] - H[a])
            vv = np.cross([1.0, 0, 0], u)
            vv /= np.linalg.norm(vv)
            self.lado[k] = 1.0 if np.dot(H[b] - H[a], vv) > 0 else -1.0
        # ossos de cada perna e do corpo (para o chão)
        self.ossos_perna = {}
        for k, v in pr.items():
            nomes = list(v["ik"]) + [v["pata"]] + ([v["meta"]] if v["meta"] else [])
            self.ossos_perna[k] = [self.i(n) for n in nomes]
        if self.V is not None:
            dom = self.Wv.argmax(1)
            self.v_perna = {k: np.isin(dom, ids) for k, ids in self.ossos_perna.items()}
            todas = np.zeros(len(self.V), bool)
            for m in self.v_perna.values():
                todas |= m
            pp = self.p
            cab = [self.i(pp["cabeca"]), self.i(pp["mandibula"])] + [self.i(n) for n in pp["orelhas"]]
            self.v_cab = np.isin(dom, cab)
            self.v_cauda = np.isin(dom, [self.i(n) for n in pp["cauda"]])
            self.v_corpo = ~todas & ~self.v_cab & ~self.v_cauda

    def ponto(self, nome):
        if isinstance(nome, (list, tuple, np.ndarray)):
            return np.asarray(nome, float)
        return {"quadril": self.quadril, "ombro": self.ombro, "centro": self.centro,
                "chao": np.array([self.centro[0], self.centro[1], 0.0]),
                "quadril_chao": np.array([self.quadril[0], self.quadril[1], 0.0]),
                "ombro_chao": np.array([self.ombro[0], self.ombro[1], 0.0])}[nome]

    # -------------------------------------------- FK
    def fk(self, B, locs):
        P = np.zeros((self.n, 3))
        W = np.zeros((self.n, 3, 3))
        for i in self.ordem:
            p = self.pai[i]
            if p < 0:
                A = self.R[i]
                P[i] = self.H[i] + A @ locs.get(i, np.zeros(3))
            else:
                A = W[p] @ self.R[p].T @ self.R[i]
                P[i] = P[p] + W[p] @ self.R[p].T @ (self.H[i] - self.H[p]) + A @ locs.get(i, np.zeros(3))
            W[i] = A @ B[i]
        return P, W

    def pele(self, P, W, mascara=None):
        """Skinning linear: os vértices na pose (só os da máscara, se houver)."""
        V = self.V if mascara is None else self.V[mascara]
        Wv = self.Wv if mascara is None else self.Wv[mascara]
        M = np.einsum("bij,bkj->bik", W, self.R)  # pose · descanso⁻¹ de cada osso
        T = P - np.einsum("bij,bj->bi", M, self.H)
        X = np.einsum("bij,vj->vbi", M, V)
        return Wv @ T + np.einsum("vb,vbi->vi", Wv, X)

    # -------------------------------------------- a pose a partir das intenções
    def resolve(self, q, base=None):
        """q: intenções (dicionário plano); base: {osso: (quatérnio, loc)} de uma animação do pacote (opcional).
        Devolve (B, locs, P, W). A cabeça e a cauda que passarem do chão sobem (pescoço e cauda giram para cima)."""
        q = dict(q)
        tol = -0.004  # até 4 mm de contato
        ant, parado = None, 0
        for _ in range(20):
            B, locs, P, W = self._resolve1(q, base)
            if self.V is None:
                break
            zc = self.pele(P, W, self.v_cab)[:, 2].min() if self.v_cab.any() else 1.0
            zt = self.pele(P, W, self.v_cauda)[:, 2].min() if self.v_cauda.any() else 1.0
            if zc >= tol and zt >= tol:
                break
            if ant is not None and min(zc, 0) <= ant[0] + 0.0005 and min(zt, 0) <= ant[1] + 0.0005:
                parado += 1
                if parado >= 2:
                    break  # não melhora mais
            else:
                parado = 0
            ant = (min(zc, 0), min(zt, 0))
            if zc < tol:
                q = self._melhor(q, base, [{"pescoco.pitch": 4.0, "cabeca.pitch": 1.5}, {"pescoco.yaw": 4.0},
                                           {"pescoco.roll": 4.0, "cabeca.roll": 2.0}, {"orelhas": 8.0},
                                           {"corpo.al": 0.01}], self.v_cab)
            if zt < tol:
                q = self._melhor(q, base, [{"cauda.sobe": 5.0, "cauda.enrola": 8.0}, {"cauda.lado": 7.0}], self.v_cauda)
        return B, locs, P, W

    def _melhor(self, q, base, opcoes, mascara):
        """Gira os parâmetros de uma das opções (para um lado ou para o outro): fica com o que levantar mais."""
        melhor, zbest = q, -9.0
        for passos in opcoes:
            for sinal in (1, -1):
                qq = dict(q)
                for k, d in passos.items():
                    qq[k] = qq.get(k, 0) + sinal * d
                B, locs, P, W = self._resolve1(dict(qq), base)
                z = self.pele(P, W, mascara)[:, 2].min()
                if z > zbest:
                    melhor, zbest = qq, z
        return melhor

    def _resolve1(self, q, base=None):
        g = q.get
        B = np.tile(np.eye(3), (self.n, 1, 1))
        locs = {}
        if base:
            for nome, (qt, lc) in base.items():
                if nome in self.idx:
                    B[self.idx[nome]] = mat_quat(qt)
                    if lc is not None and np.any(np.abs(lc) > 1e-7):
                        locs[self.idx[nome]] = np.array(lc)
        pp = self.p
        r = self.i(pp["raiz"])

        def poe(nome, G):  # giro G (nos eixos do bicho) antes da base
            i = self.i(nome)
            B[i] = (self.R[i].T @ G @ self.R[i]) @ B[i]

        def cadeia(nomes, pitch, yaw, roll, pesos=None):
            if not nomes:
                return
            pesos = pesos or [1.0 / len(nomes)] * len(nomes)
            for nome, w in zip(nomes, pesos):
                if pitch or yaw or roll:
                    poe(nome, giro(pitch * w, yaw * w, roll * w))

        cadeia(pp["lombar"], g("lombar.pitch", 0), g("lombar.yaw", 0), g("lombar.roll", 0))
        cadeia(pp["costas"], g("costas.pitch", 0), g("costas.yaw", 0), g("costas.roll", 0))
        cadeia(pp["pescoco"], g("pescoco.pitch", 0), g("pescoco.yaw", 0), g("pescoco.roll", 0))
        cadeia([pp["cabeca"]], g("cabeca.pitch", 0), g("cabeca.yaw", 0), g("cabeca.roll", 0))
        if g("boca", 0):
            poe(pp["mandibula"], Rx(g("boca", 0)))
        for k, nome in enumerate(pp["orelhas"]):
            tras = g("orelhas", 0) + g("orelha_e" if k == 0 else "orelha_d", 0)
            sx = 1 if k == 0 else -1
            fora = g("orelhas.fora", 0)
            if tras or fora:
                poe(nome, Rx(-tras) @ Ry(sx * fora))
        cauda = pp["cauda"]
        if cauda:
            nc = len(cauda)
            sobe, lado, enrola = g("cauda.sobe", 0), g("cauda.lado", 0), g("cauda.enrola", 0)
            ondula, fase, atraso = g("cauda.ondula", 0), g("cauda.fase", 0), g("cauda.atraso", 0)
            for k, nome in enumerate(cauda):
                base_w = 1.0 if nc == 1 else (0.45 if k == 0 else 0.55 / (nc - 1))
                lk = lado * base_w + (ondula * math.sin(math.radians(fase - atraso * k)) if ondula else 0.0)
                sk = sobe * base_w + (enrola * k / max(nc - 1, 1) if nc > 1 else 0)
                if k == 0 and nc > 1:  # cauda.base: só a raiz de uma cauda de vários ossos (deitar a cauda no chão)
                    sk += g("cauda.base", 0)
                if sk or lk:
                    poe(nome, Rx(sk) @ Rz(-lk))
        # ombros (escápula / bacia): giro para a frente (pitch)
        for k in PERNAS:
            ob = pp["pernas"][k]["ombro"]
            if ob and g(k + ".ombro", 0):
                poe(ob, Rx(-g(k + ".ombro", 0)))
        # o corpo inteiro: giro em volta do pivô + deslocamento (na raiz)
        G = giro(g("corpo.pitch", 0), g("corpo.yaw", 0), g("corpo.roll", 0))
        pivo = self.ponto(g("pivo", "centro"))
        t = np.array([g("corpo.la", 0), -g("corpo.fr", 0), g("corpo.al", 0)]) * self.h
        Wb = self.R[r] @ B[r]
        hb = self.H[r] + self.R[r] @ locs.get(r, np.zeros(3))

        def corpo(dz):
            nW = G @ Wb
            nh = pivo + G @ (hb - pivo) + t + np.array([0, 0, dz])
            B[r] = self.R[r].T @ nW
            locs[r] = self.R[r].T @ (nh - self.H[r])

        def pernas(P, W):
            for k in PERNAS:
                if g(k + ".fk", 0):
                    continue
                self._ik(k, q, B, P, W, G, pivo, t, dz_corpo[0])

        dz_corpo = [0.0]
        corpo(0.0)
        P, W = self.fk(B, locs)
        if self.V is not None:
            corpo_v = self.pele(P, W, self.v_corpo)
            zmin = corpo_v[:, 2].min()
            for k in PERNAS:  # as pernas que seguem a animação do pacote (FK) também não passam do chão
                if g(k + ".fk", 0):
                    zmin = min(zmin, self.pele(P, W, self.v_perna[k])[:, 2].min())
            apoio = g("apoio", 0)
            dz = -zmin * apoio if zmin > 0 else -zmin  # nunca atravessa; com apoio, encosta
            if abs(dz) > 1e-6:
                dz_corpo[0] = dz
                corpo(dz)
                P, W = self.fk(B, locs)
        pernas(P, W)
        P, W = self.fk(B, locs)
        # as patas que afundarem sobem o alvo (duas passadas)
        if self.V is not None:
            for _ in range(2):
                extra = {}
                for k in PERNAS:
                    vz = self.pele(P, W, self.v_perna[k])[:, 2].min()
                    if vz < -0.004:  # até 4 mm é o contato da almofada; mais que isso, a pata sobe
                        extra[k] = -vz - 0.003
                if not extra:
                    break
                for k, e in extra.items():
                    q[k + "._sobe"] = q.get(k + "._sobe", 0) + e
                pernas(P, W)
                P, W = self.fk(B, locs)
        return B, locs, P, W

    def _ik(self, k, q, B, P, W, G, pivo, t, dz):
        g = q.get
        pr = self.p["pernas"][k]
        h = self.h
        ia, ib = self.i(pr["ik"][0]), self.i(pr["ik"][1])
        im = self.i(pr["meta"]) if pr["meta"] else None
        it = self.i(pr["pata"])
        rel = g(k + ".corpo", 0)  # 0: alvo no chão; 1: alvo preso ao corpo
        yaw = g(k + ".yaw", g("chao.yaw", 0))
        off = np.array([g(k + ".la", 0), -g(k + ".fr", 0), g(k + ".al", 0)]) * h
        T0 = self.T0[k]
        # no chão: o alvo gira junto com o yaw da pata em volta do pivô do giro do chão
        pivo_chao = self.ponto(g("chao.pivo", "chao"))
        Tch = pivo_chao + Rz(yaw) @ (T0 - pivo_chao) + Rz(yaw) @ off
        Tco = pivo + G @ (T0 + off - pivo) + t + np.array([0, 0, dz])
        T = Tch * (1 - rel) + Tco * rel
        T = T + np.array([0, 0, g(k + "._sobe", 0)])
        # direção do metatarso e do dedo
        Gch = Rz(yaw) @ Rx(-g(k + ".meta", 0))
        Gco = G @ Rx(-g(k + ".meta", 0))
        Gm = Gch if rel < 0.5 else Gco
        # pai da cadeia: FK da escápula/bacia (se houver) com a base atual
        def frame(i, Pp, Wp, ip):
            A = Wp @ self.R[ip].T @ self.R[i]
            hd = Pp + Wp @ self.R[ip].T @ (self.H[i] - self.H[ip])
            return A, hd
        ip = self.pai[ia]
        Pp, Wp = P[ip], W[ip]
        # ombro já está em P/W (faz parte do FK); a cadeia começa nele
        A1, Ha = frame(ia, Pp, Wp, ip)
        lat = Wp @ self.R[ip].T @ np.array([1.0, 0, 0])  # o eixo do lado, levado pelo pai
        if im is not None:
            dm0 = self.H[it] - self.H[im]
            dm0 /= np.linalg.norm(dm0)
            dm = Gm @ dm0
            Ak = T - dm * self.lm[k]
        else:
            Ak = T
        D = Ak - Ha
        d = np.linalg.norm(D)
        l1, l2 = self.l1[k], self.l2[k]
        d = np.clip(d, abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995)
        u = D / (np.linalg.norm(D) + 1e-12)
        v = np.cross(lat, u)
        v /= np.linalg.norm(v) + 1e-12
        a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
        hh = math.sqrt(max(l1 * l1 - a * a, 0.0))
        K = Ha + u * a + v * hh * self.lado[k]
        Ak2 = Ha + u * d
        # osso de cima
        r1 = A1 @ (self.R[ia].T @ (self.H[ib] - self.H[ia]))
        W1 = rot_min(r1, K - Ha) @ A1
        B[ia] = A1.T @ W1
        A2, Hb = frame(ib, Ha, W1, ia)
        nxt = im if im is not None else it
        r2 = A2 @ (self.R[ib].T @ (self.H[nxt] - self.H[ib]))
        W2 = rot_min(r2, Ak2 - Hb) @ A2
        B[ib] = A2.T @ W2
        Wprev, Pprev, iprev = W2, Hb, ib
        if im is not None:
            A3, Hm = frame(im, Pprev, Wprev, iprev)
            r3 = A3 @ (self.R[im].T @ (self.H[it] - self.H[im]))
            W3 = rot_min(r3, dm) @ A3
            B[im] = A3.T @ W3
            Wprev, Pprev, iprev = W3, Hm, im
        # dedo: plano (o de descanso, com o yaw da pata e o giro do dedo)
        A4, Ht = frame(it, Pprev, Wprev, iprev)
        dt0 = self.R[it][:, 1]
        Gd = (Rz(yaw) if rel < 0.5 else G) @ Rx(-g(k + ".dedo", 0))
        W4 = rot_min(A4 @ (self.R[it].T @ dt0), Gd @ dt0) @ A4
        B[it] = A4.T @ W4


# ---------------------------------------------------------------- chaves e interpolação
def suave(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def chaves(t, ks):
    """ks: [(tempo, {param: valor})]. Valor que falta numa chave vale 0 (descanso). Interpolação suave entre chaves."""
    nomes = set()
    for _, d in ks:
        nomes |= set(d)
    if t <= ks[0][0]:
        return {n: ks[0][1].get(n, 0.0) for n in nomes}
    for (t0, a), (t1, b) in zip(ks, ks[1:]):
        if t0 <= t <= t1:
            s = suave((t - t0) / max(t1 - t0, 1e-9))
            return {n: a.get(n, 0.0) * (1 - s) + b.get(n, 0.0) * s for n in nomes}
    return {n: ks[-1][1].get(n, 0.0) for n in nomes}


def soma(*ds):
    out = {}
    for d in ds:
        for k, v in d.items():
            if isinstance(v, str):
                out[k] = v
            else:
                out[k] = out.get(k, 0.0) + v
    return out


def onda(t, freq, fase=0.0):
    return math.sin(2 * math.pi * freq * t + fase)


def janela(t, a, b, borda=0.25):
    """1 dentro de [a, b], subindo e descendo suave nas bordas (borda em segundos)."""
    if t <= a - borda or t >= b + borda:
        return 0.0
    if t < a:
        return suave((t - (a - borda)) / borda)
    if t > b:
        return 1 - suave((t - b) / borda)
    return 1.0


# ---------------------------------------------------------------- amostra uma animação do pacote
def amostra_acao(acao, quadro):
    """{osso: (quatérnio, loc)} da ação no quadro (avalia as curvas)."""
    d = {}
    for lay in acao.layers:
        for st in lay.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    dp = fc.data_path
                    if '"' not in dp:
                        continue
                    osso = dp.split('"')[1]
                    e = d.setdefault(osso, [np.array([1.0, 0, 0, 0]), np.zeros(3)])
                    if dp.endswith("rotation_quaternion"):
                        e[0][fc.array_index] = fc.evaluate(quadro)
                    elif dp.endswith("location"):
                        e[1][fc.array_index] = fc.evaluate(quadro)
    return {k: (v[0], v[1]) for k, v in d.items()}


# ---------------------------------------------------------------- grava no Blender
def grava_acao(arm, rig, nome, poses, quadro0=1):
    """poses: [(quadro, B, locs)]. Cria a ação com rotação (quatérnio), posição e escala de todos os ossos."""
    import bpy
    act = bpy.data.actions.new(nome)
    slot = act.slots.new(id_type="OBJECT", name=arm.name)
    lay = act.layers.new("camada")
    st = lay.strips.new(type="KEYFRAME")
    cb = st.channelbag(slot, ensure=True)
    nq = len(poses)
    quadros = np.array([p[0] for p in poses], float)
    Q = np.zeros((nq, rig.n, 4))
    L = np.zeros((nq, rig.n, 3))
    for k, (f, B, locs) in enumerate(poses):
        for i in range(rig.n):
            qq = quat(B[i])
            if k and np.dot(qq, Q[k - 1, i]) < 0:
                qq = -qq
            Q[k, i] = qq
            if i in locs:
                L[k, i] = locs[i]
    for i, osso in enumerate(rig.nomes):
        base = 'pose.bones["%s"].' % osso
        for prop, arr, nidx in (("rotation_quaternion", Q[:, i], 4), ("location", L[:, i], 3),
                                ("scale", np.ones((nq, 3)), 3)):
            for j in range(nidx):
                fc = cb.fcurves.new(base + prop, index=j)
                fc.keyframe_points.add(nq)
                co = np.empty(2 * nq)
                co[0::2] = quadros
                co[1::2] = arr[:, j]
                fc.keyframe_points.foreach_set("co", co)
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
                fc.update()
    return act


def faz_poses(rig, fn, segundos, base_fn=None):
    """Resolve a animação fn(t, rig) → intenções a cada PASSO quadros (o último quadro incluído)."""
    nq = int(round(segundos * FPS))
    quadros = list(range(0, nq + 1, PASSO))
    if quadros[-1] != nq:
        quadros.append(nq)
    poses = []
    zmin = 9.0
    for f in quadros:
        t = f / FPS
        q = dict(fn(t, rig))
        base = base_fn(t) if base_fn else None
        B, locs, P, W = rig.resolve(q, base)
        if rig.V is not None:
            zmin = min(zmin, rig.pele(P, W)[:, 2].min())
        poses.append((1 + f, B, locs))
    return poses, zmin


def deslize(rig, fn, segundos):
    """Quanto cada pata plantada (no chão, sem subir) se move de um quadro para o outro: o maior valor (m)."""
    nq = int(round(segundos * FPS))
    ant = None
    pior = 0.0
    for f in range(0, nq + 1, PASSO):
        q = dict(fn(f / FPS, rig))
        B, locs, P, W = rig.resolve(q)
        pts = {k: P[rig.i(rig.p["pernas"][k]["pata"])] for k in PERNAS}
        if ant:
            for k in PERNAS:
                if pts[k][2] < 0.03 and ant[k][2] < 0.03:
                    pior = max(pior, float(np.linalg.norm(pts[k][:2] - ant[k][:2])))
        ant = pts
    return pior
