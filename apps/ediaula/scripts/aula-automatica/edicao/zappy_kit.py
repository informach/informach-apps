"""O Zappy de verdade nas cenas: a prancheta dele feita no EdiSVG (Sistema Zero, art/edisvg), com as animações
próprias, como componente da cena (Helena, 27/11/2026: "já tem as animações próprias dele... com a boquinha
mexendo, com as asinhas batendo, tem várias poses").

As artes ficam em artes/zappy/ (cópias de sistema-zero/art/edisvg: derived/zappy-falando.edisvg e
sources/celebrando, pensando, alivio). Cada pose entra no arquivo da cena uma vez, como prancheta, e a cena põe um
nó que é instância dela, tocando a animação da pose em loop, no compasso da cena.

- falando: voa, bate as asas e pisca (o braço fica parado: ver `leve`); a boca mexe só nos trechos de fala (falas=[(ini, fim), ...]) e fica
  fechada no resto. São duas animações da mesma prancheta, "voar falando" e "voar calado", com o mesmo voo; a cena
  troca uma pela outra na hora da fala, sem pulo.
- celebrando, pensando, alivio: a animação da pose em loop.

O Zappy é complemento: o destaque da cena é o que a fala explica (o bloco, o jogo). Altura de 220 a 320 px, num
canto da área livre, nunca maior que o assunto.
"""
import copy
import json
import os
import uuid

from edisvg_cena import FPS, nid, tf

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artes", "zappy")
# A prancheta das poses tem 500 x 500, com o Zappy no meio e margem em volta para o voo e as asas. CORPO é a caixa
# do Zappy de verdade (das antenas aos pés, asa a asa) e CABECA o lado da cabeça (onde cai a ponta do balão), em
# unidades da prancheta.
LADO = 500
CORPO = (110, 65, 390, 445)
CABECA = {"falando": (345, 205), "celebrando": (345, 205), "pensando": (345, 205), "alivio": (345, 205)}
_VOO = "Voar e acenar"


def _fonte(pose):
    d = json.load(open(os.path.join(PASTA, f"{pose}.edisvg"), encoding="utf8"))
    art = next(a for a in d["artboards"] if a["scene"]["nodes"])
    return d, art


def _quadros(keys, fator):
    """As chaves no compasso da cena, cada uma com id novo (a mesma pose em duas animações repetiria os ids)."""
    for k in keys:
        k["frame"] = round(k["frame"] * fator)
        k["id"] = f"key-{uuid.uuid4()}"
    return keys


def _ciclos(trilha, frames_ciclo, total, deslocar=0):
    """A trilha repetida em ciclos de frames_ciclo até total (o loop desenrolado numa animação maior)."""
    keys = []
    for n in range(0, total // frames_ciclo + 1):
        for k in trilha["keys"]:
            f = k["frame"] + n * frames_ciclo + deslocar
            if f <= total and (not keys or f > keys[-1]["frame"]):
                keys.append(dict(k, id=f"key-{uuid.uuid4()}", frame=f))
    return dict(trilha, id=f"track-{uuid.uuid4()}", keys=keys)


def registrar(c, pose):
    """Põe a prancheta da pose no arquivo da cena (uma vez) e devolve {nome da animação: id}."""
    cache = c.__dict__.setdefault("_zappy", {})
    if pose in cache:
        return cache[pose]
    d, art = _fonte(pose)
    art = copy.deepcopy(art)
    art["id"] = f"artboard-zappy-{pose}"
    art["name"] = f"Zappy · {pose}"
    # A máquina de estados da boca (behavior) não convive com animação sincronizada na instância; a cena troca as
    # animações ela mesma.
    art.pop("behavior", None)
    anims = {}
    fonte = {a["id"]: a for a in d["motion"]["animations"]}
    # Só as trilhas dos objetos desta prancheta: o arquivo do Sistema Zero tem uma segunda prancheta, e a animação de
    # voo também mexe num objeto dela (o EdiSVG recusa a cena: "Trilha referencia um objeto inexistente").
    ids = set()

    def junta(no):
        ids.add(no["id"])
        for f in no.get("children", []):
            junta(f)

    for no in art["scene"]["nodes"]:
        junta(no)
    existe = lambda t: t["targetId"] in ids
    nomes = {}

    def nomeia(no):
        nomes[no["id"]] = no.get("name", "")
        for f in no.get("children", []):
            nomeia(f)

    for no in art["scene"]["nodes"]:
        nomeia(no)
    # O EdiSVG aceita até 256 deformações por cena (edi-motion/src/playback.ts), e cada chave de deformação de
    # vértice conta uma. O aceno do braço do "falando" tem 25 por ciclo, e a pose entra com duas animações (falando
    # e calado): dois Zappys falando e um pensando davam 276 e a cena não renderizava. O braço fica parado; o piscar
    # dos olhos (36) fica.
    leve = lambda v: not (pose == "falando" and nomes.get(v["targetId"], "").startswith("Braço"))
    clips = art.get("vertexClips", [])
    novos_clips = []

    def nova(nome, base, extra_tracks=()):
        aid = f"animation-zappy-{pose}-{uuid.uuid5(uuid.NAMESPACE_URL, nome)}"
        fator = FPS / base["fps"]
        total = round(base["frames"] * fator)
        tracks = [dict(copy.deepcopy(t), id=f"track-{uuid.uuid4()}", keys=_quadros(copy.deepcopy(t["keys"]), fator))
                  for t in base["tracks"] if existe(t)]
        tracks += [t for t in extra_tracks if existe(t)]
        c.anims_extra.append({"id": aid, "name": f"Zappy · {nome}", "fps": FPS, "frames": total, "mode": "loop",
                              "tracks": tracks})
        # A deformação do braço (vertexClips) da animação de base vale também para a nova.
        for v in clips:
            if v["animationId"] == base["id"] and existe(v) and leve(v):
                novos_clips.append(dict(copy.deepcopy(v), id=f"track-{uuid.uuid4()}", animationId=aid,
                                        keys=_quadros(copy.deepcopy(v["keys"]), fator)))
        anims[nome] = aid
        return total

    if pose == "falando":
        voo = next(a for a in d["motion"]["animations"] if a["name"] == _VOO)
        total = round(voo["frames"] * FPS / voo["fps"])
        for nome, boca in (("voar falando", "Boca falando"), ("voar calado", "Boca em repouso")):
            b = next(a for a in d["motion"]["animations"] if a["name"] == boca)
            extra = [_ciclos(dict(t, keys=_quadros(copy.deepcopy(t["keys"]), FPS / b["fps"])),
                             round(b["frames"] * FPS / b["fps"]), total) for t in b["tracks"]]
            nova(nome, voo, extra)
    else:
        for a in fonte.values():
            nova(a["name"], a)
    art["vertexClips"] = novos_clips
    if not novos_clips:
        art.pop("vertexClips")
    c.d["artboards"].append(art)
    cache[pose] = anims
    return anims


PREFERIDA = {"pensando": "Voo pensativo"}


def _instancia(c, pose, aid, altura, op):
    # Centrada no grupo: o pulinho de entrada (pop) cresce do meio do Zappy, não do canto.
    return {"id": nid(), "name": f"Zappy · {pose}", "tag": "g", "attrs": {}, "text": "",
            "transform": tf(-altura / 2, -altura / 2, op), "visible": True, "locked": False,
            "instance": {"artboardId": f"artboard-zappy-{pose}", "animationId": aid, "width": altura,
                         "height": altura, "fit": "contain", "speed": 1, "offsetSeconds": 0, "overrides": []}}


def zappy_vivo(c, pose, x, y, altura, t0, t1=None, falas=(), pop=True):
    """O Zappy animado com o canto de cima à esquerda do corpo dele em (x, y) e `altura` px das antenas aos pés.
    falas: [(ini, fim), ...] em segundos da aula, quando a boca mexe (só a pose "falando"). Devolve (grupo, ponto ao
    lado da cabeça para a ponta do balão)."""
    anims = registrar(c, pose)
    s = altura / (CORPO[3] - CORPO[1])
    lado = round(LADO * s, 1)
    x, y = x - CORPO[0] * s, y - CORPO[1] * s
    altura = lado
    if pose == "falando":
        fala = _instancia(c, pose, anims["voar falando"], altura, 0)
        calado = _instancia(c, pose, anims["voar calado"], altura, 100)
        filhos = [calado, fala]
        if falas:
            ch_f, ch_c = [(c.ini, 0, "hold")], [(c.ini, 100, "hold")]
            for a, b in falas:
                ch_f += [(a, 100, "hold"), (b, 0, "hold")]
                ch_c += [(a, 0, "hold"), (b, 100, "hold")]
            c.trilha(fala, "opacity", ch_f)
            c.trilha(calado, "opacity", ch_c)
    else:
        # A animação de cada pose: a primeira do arquivo, menos no "pensando", que usa o "Voo pensativo". No
        # "Pensando" um braço cruza a barriga até o queixo e, pequeno na cena, parece tudo embolado (Helena,
        # 28/11/2026: "as mãozinhas ficam confusas, emboladas").
        nome = PREFERIDA.get(pose) if PREFERIDA.get(pose) in anims else next(iter(anims))
        filhos = [_instancia(c, pose, anims[nome], altura, 100)]
    g = c.grupo(f"Zappy · {pose}", x + altura / 2, y + altura / 2, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=pop)
    hx, hy = CABECA.get(pose, (345, 205))
    return g, (round(x + hx * s), round(y + hy * s))
