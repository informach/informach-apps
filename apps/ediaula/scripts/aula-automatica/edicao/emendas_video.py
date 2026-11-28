"""Vãos na imagem da aula: instantes em que nada cobre a tela inteira (gravação, animação, capa, vinheta) entre
dois clipes. Um vão de poucos quadros aparece como uma piscada (branco ou preto) na emenda de um corte (Helena,
28/11/2026: "às vezes fica um espacozinho mínimo ali em branco e aí dá umas piscadas").

Uso: emendas_video.py <projeto.ediaula> [--json]
Imprime cada vão (início, fim, duração, o clipe de antes e o de depois). Sai com 1 se houver algum.
Não entram na conta: anotações, camadas de zoom, a apresentadora e os personagens (ficam por cima, não cobrem a
tela inteira) e o som.
"""
import json
import sys

POR_CIMA = ("HeyGen", "Debinha", "Dedé", "Dede")  # apresentadora e personagens: não cobrem a tela


def base_visual(d):
    """Os clipes que cobrem a tela inteira: [(início, fim, nome)]."""
    assets = {a["id"]: a for a in d["assets"]}
    tracks = {t["id"]: t for t in d["tracks"]}
    out = []
    for c in d["clips"]:
        a = assets.get(c.get("assetId"))
        t = tracks.get(c["trackId"])
        if not a or not t or t.get("hidden") or c.get("annotation") or c.get("zoomLayer"):
            continue
        if a.get("kind") not in ("video", "image") or any(n in a.get("name", "") for n in POR_CIMA):
            continue
        out.append((c["start"], c["start"] + c["duration"], a.get("name", "?"), c["id"]))
    return sorted(out)


def vaos(d, minimo=1 / 120):
    """Intervalos sem nada da base visual entre o primeiro e o último clipe dela."""
    base = base_visual(d)
    res = []
    if not base:
        return res
    fim, quem = base[0][1], base[0]
    for ini, f, nome, cid in base[1:]:
        if ini - fim > minimo:
            res.append({"ini": round(fim, 3), "fim": round(ini, 3), "dur": round(ini - fim, 3),
                        "antes": quem[2], "antes_id": quem[3], "depois": nome, "depois_id": cid})
        if f > fim:
            fim, quem = f, (ini, f, nome, cid)
    return res


if __name__ == "__main__":
    d = json.load(open(sys.argv[1], encoding="utf-8"))
    v = vaos(d)
    if "--json" in sys.argv:
        print(json.dumps(v, ensure_ascii=False))
    else:
        for x in v:
            print(f"{x['ini']:.2f}–{x['fim']:.2f} ({x['dur'] * 30:.1f} quadros): entre {x['antes']} e {x['depois']}")
        print(f"{len(v)} vãos")
    sys.exit(1 if v else 0)
