import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import moveis_base as mb
import cidade_base as cb
SAIDA = sys.argv[sys.argv.index("--") + 1]
cat = mb.Catalogo("teste_cidade", SAIDA)
def peca(id_, f, *a, **k):
    mb.limpa(); it = mb.Item(id_); f(it, *a, **k); cb.exporta(cat, it, id_, id_)
peca("rua_reta", cb.rua_reta)
peca("avenida_reta", cb.rua_reta, cb.AVENIDA)
peca("rua_cruzamento_x", cb.rua_cruzamento)
peca("rua_cruzamento_t", cb.rua_cruzamento, bracos=(False, True, True, True))
peca("rua_curva", cb.rua_curva)
peca("avenida_curva", cb.rua_curva, cb.AVENIDA)
peca("rua_fim", cb.rua_fim)
peca("avenida_cruzamento_x", cb.rua_cruzamento, cb.AVENIDA, r=1.0)
for n in ("road_001", "road_009", "Set_B_Tiles_05"):
    mb.limpa(); pc = cb.importa_cidade(n); it = mb.Item(n.lower() + "_pacote"); it.add(*pc.values()); cb.exporta(cat, it, n, n, pacote=True)
