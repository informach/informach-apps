"""Peças de teste da base de móveis (e exemplo para os geradores de categoria).
Uso: blender-venv/bin/python -I moveis_teste.py -- <saida>"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import moveis_base as mb  # noqa: E402

SAIDA = sys.argv[sys.argv.index("--") + 1]
cat = mb.Catalogo("teste", SAIDA, "Teste")

# 1. criado-mudo: gaveta em cima, porta embaixo, pezinhos de bola
mb.limpa()
it = mb.Item("criado_teste")
L, P, A, Z0, E = 0.48, 0.40, 0.46, 0.08, 0.022
it.add(mb.carcaca(L, P, A, z=Z0, cor="rosa", prateleiras=[0.2], fundo=True))
it.add(mb.caixa(L + 0.03, P + 0.03, 0.035, z=Z0 + A, cor="rosa_escuro", bisel=0.012))
it.add(mb.quatro_pes("bola", L, P, 0.08, "madeira_mel", r=0.03, recuo=0.05))
fr = mb.frente(L - 2 * E - 0.006, 0.17, estilo="moldura", cor="rosa_claro", cor2="rosa_claro", margem=0.025)
mb.transforma(fr, loc=(0, -P / 2, Z0 + A - E - 0.175))
pux = mb.puxador("bola", x=0, y=-P / 2 - 0.022, z=Z0 + A - E - 0.09, cor="ouro")
it.gaveta(L - 2 * E - 0.02, P - 0.05, 0.13, [fr, pux], y_frente=-P / 2, z=Z0 + A - E - 0.17, cor="creme")
fp = mb.frente(L - 2 * E - 0.006, A - 0.2 - E - 0.012, estilo="almofada", cor="rosa_claro", cor2="rosa_claro",
               margem=0.04)
mb.transforma(fp, loc=(0, -P / 2, Z0 + E + 0.003))
pp = mb.puxador("bola", x=L / 2 - E - 0.05, y=-P / 2 - 0.022, z=Z0 + 0.17, cor="ouro")
it.porta([fp, pp], dobradica=(-L / 2 + E, -P / 2 - 0.011, 0), lado="esq")
it.slot("prateleira", (0, 0.01, Z0 + E), (L - 2 * E, P - 0.05, 0.18))
cat.exporta(it, "Criado-mudo de teste", grupo="teste")

# 2. armário de cozinha com pia: portas com recorte, tampo, cuba e torneira
mb.limpa()
it = mb.Item("pia_teste")
L, P, A = 0.9, 0.6, 0.82
it.add(mb.carcaca(L, P, A - 0.04, z=0.08, cor="terracota", prateleiras=[0.35]))
it.add(mb.caixa(L - 0.06, P - 0.08, 0.08, y=0.03, cor="terracota_escura", bisel=0.01))
tampo = mb.extrudado(mb.ret_arredondado(L + 0.04, P + 0.03, 0.02), 0.05, z=A + 0.04, cor="azul_acinzentado",
                     bisel=0.015)
it.add(tampo)
it.add(mb.torno([(0, 0), (0.17, 0), (0.2, 0.12), (0.2, 0.14), (0.0, 0.14)], y=-0.03, z=A + 0.0, cor="porcelana",
                esc=(1.3, 0.9)))
it.add(mb.tubo([(0, 0.2, A + 0.09), (0, 0.2, A + 0.33), (0, 0.05, A + 0.33), (0, 0.05, A + 0.26)], 0.014,
               cor="ouro", raio_curva=0.07))
for sx in (-1, 1):
    it.add(mb.cilindro(0.018, 0.06, x=sx * 0.09, y=0.2, z=A + 0.09, cor="ouro"))
    it.add(mb.caixa(0.07, 0.015, 0.015, x=sx * 0.09, y=0.2, z=A + 0.15, cor="ouro", bisel=0.006))
for k, (x0, lado) in enumerate(((-L / 2 + 0.022, "esq"), (L / 2 - 0.022, "dir"))):
    w = L / 2 - 0.022 - 0.004
    f = mb.frente(w, A - 0.06, estilo="recorte", cor="amarelo", cor2="amarelo_claro", margem=0.06)
    xc = x0 + (w / 2 if lado == "esq" else -w / 2)
    mb.transforma(f, loc=(xc, -P / 2, 0.1))
    pz = mb.puxador("bola", x=xc + (w / 2 - 0.05) * (1 if lado == "esq" else -1), y=-P / 2 - 0.022, z=0.5, cor="laranja")
    it.porta([f, pz], dobradica=(x0, -P / 2 - 0.011, 0), lado=lado)
it.add(mb.quatro_pes("bloco", L - 0.06, P - 0.1, 0.08, "amarelo_escuro", r=0.025, recuo=0.03))
it.slot("prateleira_baixo", (0, 0.01, 0.1), (L - 0.05, P - 0.05, 0.3))
cat.exporta(it, "Pia de teste", grupo="teste")

# 3. sofá de dois lugares com almofadas
mb.limpa()
it = mb.Item("sofa_teste")
L, P = 1.6, 0.85
it.add(mb.superelipsoide(L, P, 0.32, z=0.1, cor="azul", e=0.18, e_v=0.3))
it.add(mb.superelipsoide(L, 0.25, 0.72, y=P / 2 - 0.13, z=0.1, cor="azul", e=0.2, e_v=0.3))
for sx in (-1, 1):
    it.add(mb.superelipsoide(0.2, P, 0.55, x=sx * (L / 2 - 0.1), z=0.1, cor="azul", e=0.25, e_v=0.35))
for sx in (-1, 1):
    it.add(mb.almofada(0.62, 0.62, 0.16, x=sx * 0.33, y=-0.08, z=0.39, cor="azul_celeste"))
    it.add(mb.almofada(0.6, 0.5, 0.15, x=sx * 0.33, y=P / 2 - 0.28, z=0.52, cor="azul_celeste", rot=("X", 75)))
it.add(mb.quatro_pes("conico", L - 0.1, P - 0.15, 0.1, "madeira_escura", r=0.025, recuo=0.03))
cat.exporta(it, "Sofá de teste", grupo="teste")

# 4. abajur (torno) e 5. vaso com planta simples
mb.limpa()
it = mb.Item("abajur_teste")
it.add(mb.torno([(0, 0), (0.09, 0), (0.1, 0.02), (0.07, 0.05), (0.04, 0.12), (0.06, 0.2), (0.02, 0.27), (0, 0.27)],
                cor="rosa"))
it.add(mb.torno([(0.0, 0.25), (0.15, 0.25), (0.1, 0.45), (0.0, 0.45)], cor="amarelo_claro", angulo=60))
it.add(mb.esfera(0.04, z=0.3, cor=None, mat="luz"))
cat.exporta(it, "Abajur de teste", grupo="teste", fixacao="apoio")

# 6. do pacote: armário de duas portas (portas do pacote → nossas portas)
mb.limpa()
pc = mb.importa_pacote("Closet_02")
it = mb.Item("armario_pacote_teste")
it.add(pc.pop("corpo"))
for nm, ob in sorted(pc.items()):
    lo, hi = mb.bbox(ob)
    esq = (lo.x + hi.x) / 2 < 0
    it.porta([ob], dobradica=((lo.x if esq else hi.x), lo.y, 0), lado="esq" if esq else "dir")
cat.exporta(it, "Armário do pacote (teste)", grupo="teste", pacote=True)

print("ok")
