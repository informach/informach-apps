"""Resolve tudo o que uma parte precisa a partir do config.json (ou de AULA_CONFIG).

Uso: config.py <curso> <aula> <parte>  ->  imprime um JSON com nome do projeto, endereço da aula no
palco, roteiro, voz, pasta do material, vídeo da apresentadora, perfil do EdiAula e pasta de edição.
Também serve de módulo: from config import parte.
"""

import glob
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))


def _caminho(p):
    return os.path.normpath(os.path.expanduser(p)).replace("\\", "/") if p else p


def _titulo_da_capa(roteiro, n, titulo):
    """O título da parte como o roteiro escreve, quando a pasta só perdeu o que o Windows não aceita
    num nome (o "?" de "O que aparece quando você muda de lugar?", na Ilha). Sem o roteiro, ou com
    outro título nele, vale o da pasta."""
    try:
        m = re.search(rf"(?m)^## Parte {int(n)}\. (.+)$", open(roteiro, encoding="utf8").read())
    except OSError:
        return titulo
    if m and re.sub(r'[<>:"/\\|?*]', "", m.group(1)).strip() == titulo:
        return m.group(1).strip()
    return titulo


def carregar():
    arq = os.environ.get("AULA_CONFIG") or os.path.join(AQUI, "config.json")
    if not os.path.exists(arq):
        sys.exit(f"Falta {arq}: copie config.exemplo.json para config.json e ajuste os caminhos.")
    return json.load(open(arq, encoding="utf8"))


def parte(curso, aula, n):
    cfg = carregar()
    c = cfg["cursos"][curso]
    a = c["aulas"][str(aula)]
    # "Aula 3" ou "AULA 03" (o Windows não liga para maiúsculas).
    nomes = [f"Aula {int(aula)}", f"Aula {int(aula):02d}"]
    material = next((m for m in (_caminho(os.path.join(c["material"], x)) for x in nomes) if os.path.isdir(m)),
                    _caminho(os.path.join(c["material"], nomes[0])))
    pastas = sorted(glob.glob(os.path.join(material, f"Parte {n} - *")))
    if not pastas:
        sys.exit(f"Não achei a pasta da parte: {material}/Parte {n} - <título>")
    pasta = _caminho(pastas[0])
    titulo = os.path.basename(pasta)[len(f"Parte {n} - "):]
    perfil = _caminho(os.environ.get("AULA_PERFIL_EDIAULA") or "~/EdiAula-teste/user-data")
    nome = f"{c['prefixo']} Aula{int(aula):02d} Parte {n} {titulo}"
    # Uma aula que não tem Estúdio próprio grava a tela numa aula de outro curso no palco (a
    # demonstração do curso dos pais usa o Estúdio do Cadê): "palco": {"slug", "id", "partes":
    # {"<parte do roteiro>": "<sufixo do endereço>"}}. "enderecos" sai sempre, vazio quando não há,
    # porque o estado do condutor guarda o da parte anterior.
    palco = a.get("palco") or {}
    slug = palco.get("slug", c["slug"])
    aula_id = palco.get("id", a.get("id"))
    # Uma aula que mostra a própria plataforma (a área dos pais, na Aula 7 do curso dos pais) grava
    # fora do palco: "palco": {"url": "<endereço da plataforma>", "partes": {...}}, e a janela da
    # aula entra com uma conta de ensaio por parte: "plataforma": {"contas": "<contas.json>",
    # "porParte": {"<parte>": "<chave da conta>"}}. O arquivo de contas fica fora do git.
    endereco_aula = palco["url"].rstrip("/") if palco.get("url") else f"{cfg['palco'].rstrip('/')}/aulas/{slug}/{aula_id}"
    plat = a.get("plataforma") or {}
    conta = (plat.get("porParte") or {}).get(str(n))
    roteiro = _caminho(a.get("roteiroLocal") or os.path.join(cfg["sistemaZero"], a["roteiro"]))
    return {
        "curso": curso,
        "aulaN": int(aula),
        "parte": int(n),
        "titulo": titulo,
        # O título na capa: o da pasta, com o "?" de volta quando o roteiro o tem.
        "tituloCapa": _titulo_da_capa(roteiro, n, titulo),
        "nome": nome,
        "cursoEdiAula": c["cursoEdiAula"],
        "aula": endereco_aula,
        "plataforma": {"url": endereco_aula, "contas": _caminho(plat["contas"]), "conta": conta} if conta else None,
        "enderecos": {str(k): v for k, v in (palco.get("partes") or {}).items()},
        # Como a mão do robô se move: a da criança nos cursos delas, a da professora quando quem
        # demonstra é ela (curso dos pais). Sai sempre, pelo mesmo motivo de "enderecos".
        "movimento": c.get("movimento", "crianca"),
        # Tempos do plano guiado que o curso muda ({"after": 0.5} encurta a pausa depois de cada
        # gesto). Vazio deixa os do plano novo.
        "tempos": c.get("tempos") or {},
        # Subtítulo da capa; sem ele, a capa leva o curso do EdiAula, como antes.
        "subtituloCapa": c.get("subtituloCapa") or c["cursoEdiAula"],
        "roteiro": roteiro,
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
