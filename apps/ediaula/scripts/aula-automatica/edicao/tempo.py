"""Tempo da voz (= tempo da aula) -> tempo do vídeo da gravação, pelas etapas do guided-run.json
(start/end na voz, began/finished no vídeo). Serve para tirar um quadro da gravação no momento de uma fala.

Uso: tempo.py <pasta da gravação> <segundos da voz>...   ou   from tempo import Tempo
"""

import bisect
import json
import sys


class Tempo:
    def __init__(self, pasta):
        run = json.load(open(f"{pasta}/guided-run.json", encoding="utf8"))
        pares = {(s["start"], s["began"]) for s in run["steps"] if s.get("began") is not None}
        pares |= {(s["end"], s["finished"]) for s in run["steps"] if s.get("finished") is not None}
        self.pares = sorted(pares)
        self.v = [a for a, _ in self.pares]

    def video(self, t):
        p, i = self.pares, bisect.bisect_left(self.v, t)
        if i <= 0:
            return p[0][1] + t - p[0][0]
        if i >= len(p):
            return p[-1][1] + t - p[-1][0]
        (a, x), (b, y) = p[i - 1], p[i]
        return x + (y - x) * (t - a) / ((b - a) or 1)


if __name__ == "__main__":
    tm = Tempo(sys.argv[1])
    for t in sys.argv[2:]:
        print(t, round(tm.video(float(t)), 2))
