"""Os segundos de uma fala na linha do tempo da edição, a partir das palavras dela, para os scripts das cenas.

A transcrição da voz dá o segundo no Áudio.wav; a edição soma o atraso com que a narração entrou na gravação
(`narrationOffset` do guided-run.json). Com isto, uma cena se ancora na frase ("Para fazer uma pergunta") e
não num número escrito à mão, que ficava adiantado quando a parte abria com uma ação (Ilha, 22/11/2026).

    from tempos_da_voz import Voz
    voz = Voz.da_parte("ilha", 3, 1)        # pelo config.json do fluxo, depois de gravar
    t0, t1 = voz.trecho("Para fazer uma pergunta", "o bloco Se.")
    t = voz.palavra("lixeira", depois=t0)    # quando a palavra é dita
"""

import json
import os
import re
import subprocess
import sys
import unicodedata

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# Palavras que a transcrição escreve como outra que soa igual: o bloco Se como a letra "c".
SOA_COMO = {"c": "se"}


def _igual(ouvida, escrita):
    """A mesma palavra (ou uma que soa igual), ou uma começo da outra com três letras ou mais ("zap" e
    "zappy")."""
    ouvida, escrita = SOA_COMO.get(ouvida, ouvida), SOA_COMO.get(escrita, escrita)
    if ouvida == escrita:
        return True
    curta, longa = sorted((ouvida, escrita), key=len)
    return len(curta) >= 3 and longa.startswith(curta)


def _chave(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn" and c.isalnum())


class Voz:
    def __init__(self, transcricao, gravacao=None):
        crus = json.load(open(transcricao, encoding="utf8"))["words"]
        self.atraso = 0.0
        run = os.path.join(gravacao, "guided-run.json") if gravacao else ""
        if run and os.path.exists(run):
            self.atraso = float(json.load(open(run, encoding="utf8")).get("narrationOffset") or 0)
        # Uma palavra da transcrição pode trazer duas ('depois "lógica"'): cada uma com a sua parte do tempo.
        self.palavras = []
        for w in crus:
            partes = [p for p in w["text"].split() if _chave(p)]
            total = sum(len(p) for p in partes) or 1
            ini = w["start"]
            for p in partes:
                fim = ini + (w["end"] - w["start"]) * len(p) / total
                self.palavras.append((_chave(p), ini + self.atraso, fim + self.atraso))
                ini = fim

    @classmethod
    def da_parte(cls, curso, aula, parte):
        cfg = json.loads(subprocess.run([sys.executable, "-X", "utf8", os.path.join(AQUI, "config.py"), curso, str(aula),
                                         str(parte)], capture_output=True, text=True, check=True).stdout)
        transcricao = subprocess.run([sys.executable, "-X", "utf8", os.path.join(AQUI, "edicao", "transcricao.py"),
                                      cfg["perfil"], cfg["voz"]], capture_output=True, text=True, check=True).stdout.strip()
        txt = os.path.join(cfg["edicao"], "gravacao.txt")
        gravacao = open(txt, encoding="utf8").read().strip() if os.path.exists(txt) else None
        return cls(transcricao, gravacao)

    def _acha(self, frase, depois=0.0):
        alvo = [_chave(p) for p in re.split(r"\s+", frase) if _chave(p)]
        chaves = [p[0] for p in self.palavras]
        melhor = None
        for i in range(len(chaves) - len(alvo) + 1):
            if self.palavras[i][1] < depois - 0.01:
                continue
            iguais = sum(1 for k, a in enumerate(alvo) if _igual(chaves[i + k], a))
            # Uma em quatro pode vir ouvida de outro jeito ("Se" sai "c"), nunca a primeira.
            if _igual(chaves[i], alvo[0]) and iguais >= len(alvo) - len(alvo) // 4:
                melhor = i
                break
        if melhor is None:
            raise ValueError(f"não achei na voz: {frase!r} (depois de {depois:.1f} s)")
        return melhor, melhor + len(alvo) - 1

    def palavra(self, frase, depois=0.0):
        """Quando a fala começa a dizer `frase` (segundos da linha do tempo)."""
        i, _ = self._acha(frase, depois)
        return round(self.palavras[i][1], 2)

    def fim(self, frase, depois=0.0):
        """Quando a fala termina de dizer `frase`."""
        _, j = self._acha(frase, depois)
        return round(self.palavras[j][2], 2)

    def trecho(self, comeco, final, depois=0.0):
        """Do começo de `comeco` ao fim de `final`, dito depois dele."""
        t0 = self.palavra(comeco, depois)
        return t0, self.fim(final, t0)
