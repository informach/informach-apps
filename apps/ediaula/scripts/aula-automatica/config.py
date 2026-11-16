"""Resolve tudo o que uma parte precisa a partir do config.json (ou de AULA_CONFIG).

Uso: config.py <curso> <aula> <parte>  ->  imprime um JSON com nome do projeto, endereço da aula no
palco, roteiro, voz, pasta do material, vídeo da apresentadora, perfil do EdiAula e pasta de edição.
Também serve de módulo: from config import parte.
"""

import glob
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))


def _caminho(p):
    return os.path.normpath(os.path.expanduser(p)).replace("\\", "/") if p else p


def carregar():
    arq = os.environ.get("AULA_CONFIG") or os.path.join(AQUI, "config.json")
    if not os.path.exists(arq):
        sys.exit(f"Falta {arq}: copie config.exemplo.json para config.json e ajuste os caminhos.")
    return json.load(open(arq, encoding="utf8"))


def parte(curso, aula, n):
    cfg = carregar()
    c = cfg["cursos"][curso]
    a = c["aulas"][str(aula)]
    material = _caminho(os.path.join(c["material"], f"Aula {aula}"))
    pastas = sorted(glob.glob(os.path.join(material, f"Parte {n} - *")))
    if not pastas:
        sys.exit(f"Não achei a pasta da parte: {material}/Parte {n} - <título>")
    pasta = _caminho(pastas[0])
    titulo = os.path.basename(pasta)[len(f"Parte {n} - "):]
    perfil = _caminho(os.environ.get("AULA_PERFIL_EDIAULA") or "~/EdiAula-teste/user-data")
    nome = f"{c['prefixo']} Aula{int(aula):02d} Parte {n} {titulo}"
    return {
        "curso": curso,
        "aulaN": int(aula),
        "parte": int(n),
        "titulo": titulo,
        "nome": nome,
        "cursoEdiAula": c["cursoEdiAula"],
        "aula": f"{cfg['palco'].rstrip('/')}/aulas/{c['slug']}/{a['id']}",
        "roteiro": _caminho(a.get("roteiroLocal") or os.path.join(cfg["sistemaZero"], a["roteiro"])),
        "pasta": pasta,
        "voz": f"{pasta}/Parte {n} - Áudio.wav",
        "apresentadora": f"{pasta}/Parte {n} - HeyGen.mp4",
        "personagens": sorted(_caminho(p) for p in glob.glob(os.path.join(pasta, f"Parte {n} - *[0-9].mp4"))),
        "projeto": f"{perfil}/documents/EdiAula/Projetos/{nome}.ediaula",
        "gravacoes": f"{perfil}/documents/EdiAula/Gravações",
        "edicao": f"{pasta}/edicao",
        "pacote": f"{pasta}/Parte {n} - Projeto EdiAula.zip",
        "credenciais": _caminho(cfg.get("credenciaisPalco")),
        "musica": _caminho(cfg.get("musica")),
        "perfil": perfil,
    }


if __name__ == "__main__":
    print(json.dumps(parte(*sys.argv[1:4]), ensure_ascii=False, indent=1))
