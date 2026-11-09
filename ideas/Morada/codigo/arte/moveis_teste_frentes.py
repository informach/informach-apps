import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import moveis_base as mb
SAIDA = sys.argv[sys.argv.index("--") + 1]
cat = mb.Catalogo("teste_frentes", SAIDA)
for est, op in (("lisa", {}), ("moldura", {}), ("almofada", {}), ("vidro", {}), ("trelica", {}), ("ripas", {}),
                ("recorte", {"recorte": "ondas"}), ("recorte", {"recorte": "arco"})):
    mb.limpa()
    it = mb.Item(f"frente_{est}_{op.get('recorte','')}")
    it.add(mb.caixa(0.5, 0.05, 0.7, y=0.03, cor="grafite"))
    f = mb.frente(0.4, 0.6, estilo=est, cor="vermelho", cor2="turquesa", **op)
    mb.transforma(f, loc=(0, 0, 0.05))
    it.add(f, mb.puxador("barra", x=0.14, y=-0.024, z=0.35, cor="amarelo"))
    for k, t in enumerate(("bola", "botao", "alca", "concha", "argola")):
        it.add(mb.puxador(t, x=-0.15 + k * 0.075, y=0.0, z=0.72, cor="ouro", vertical=False))
    cat.exporta(it, est, miniatura_dir=(0.35, -1, 0.3))
