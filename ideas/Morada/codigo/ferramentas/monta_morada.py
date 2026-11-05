"""Monta morada.html (v4) a partir do CSS/script da v3 e das partes reescritas em v4/."""
import os
import sys

R = sys.argv[1]
v3 = open(os.path.join(R, "morada_v3_backup.html"), encoding="utf-8").read()
ler = lambda n: open(os.path.join(R, "v4", n), encoding="utf-8").read()

head = v3[: v3.index("</style>")]
head = head.replace(
    "/* Layout: coluna central de 1120px; cada seção ganha uma cor da paleta e cartões com cantos chanfrados (eco do low poly); telas do jogo em molduras 960×600 que escalam */",
    "/* Layout: coluna central de 1120px; cada seção ganha uma cor da paleta e cartões com cantos chanfrados; telas do jogo em molduras 960×600 que escalam, com cenas renderizadas por baixo */",
)
css_extra = ler("telas.css") + """
/* diagramas */
pre.mermaid{font-family:var(--f-body);background:var(--surface);border-radius:18px;padding:18px;overflow-x:auto;text-align:center;margin:0;color:var(--ink)}
pre.mermaid svg{max-width:100%;height:auto}
"""

nav = [("ideia", "Ideia"), ("mundo", "Um mundo"), ("regras", "Regras"), ("dominio", "Quem é quem"),
       ("controle", "Controle"), ("vida", "Vida"), ("autonomia", "Autonomia"), ("tempo", "Tempo"),
       ("onde", "Onde roda"), ("casa", "Casa"), ("servicos", "Serviços"), ("trabalho", "Trabalho"),
       ("personagens", "Personagens"), ("arte", "Arte"), ("telas", "Telas"), ("seguranca", "Convivência"),
       ("recreio", "Recreio"), ("tecnica", "Técnica"), ("desempenho", "Desempenho"), ("plano", "Plano"),
       ("riscos", "Riscos")]
a = v3.index('<header class="top">')
b = v3.index("</header>") + len("</header>")
header = v3[a:b]
n0 = header.index('<nav class="nav" aria-label="Seções">')
n1 = header.index("</nav>")
header = header[:n0] + '<nav class="nav" aria-label="Seções">\n      ' + "".join(
    f'<a href="#{i}">{t}</a>' for i, t in nav) + "\n    " + header[n1:]

p2 = ler("parte2.html")
t0 = p2.index("<!-- TELAS -->")
t1 = p2.index("<!-- SEGURANÇA -->")
p2 = p2[:t0] + ler("telas.html") + "\n\n" + p2[t1:]
p2 = p2.replace("@@SERVICOS@@", ler("servicos_v3.html"))
assert "@@" not in p2

corpo = ler("parte1.html") + "\n" + p2

footer = """<footer>Projeto Morada · proposta v4.1 · 4 nov 2026 · consolidação técnica da v4 com o Recreio v2.1, a partir da segunda revisão externa: servidor autoritativo, política de avanço, preferido com dois direitos, bebês, continuidade do mundo, integração com o Recreio e licenças. Nomes, moeda e números de desempenho são metas a validar na fase 0. Referências técnicas consultadas: <a href="https://docs.colyseus.io/">Colyseus</a>, <a href="https://rapier.rs/docs/user_guides/javascript/character_controller/">Rapier</a>, <a href="https://threejs.org/docs/">Three.js</a>, <a href="https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API">MDN (IndexedDB, Page Visibility, PWA offline, armazenamento persistente)</a> e a <a href="https://ithappystudios.com/one-time-purchase-licence-agreement/">licença da ITHappy Studios</a>. Elas sustentam capacidades das bibliotecas, não a implementação de outros jogos; esta proposta não é auditoria de código, benchmark nem parecer jurídico. Arte: pacotes gratuitos da ITHappy Studios, adaptados; as imagens são renders de teste.</footer>"""

s0 = v3.index("<script>", v3.index("</footer>"))
s1 = v3.index("</script>", s0) + len("</script>")
script = v3[s0:s1]
c0 = script.index("  /* ---------- cena isométrica low poly ---------- */")
c1 = script.index("  /* ---------- galeria de telas ---------- */")
script = script[:c0] + script[c1:]

mermaid = """<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>
(function(){
  if(!window.mermaid)return;
  var root=document.documentElement,t=root.getAttribute('data-theme');
  var dark=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
  mermaid.initialize({startOnLoad:false,theme:dark?'dark':'neutral',fontFamily:'Figtree, system-ui, sans-serif',flowchart:{curve:'basis',htmlLabels:true}});
  mermaid.run({querySelector:'pre.mermaid'}).catch(function(){});
})();
</script>"""

html = (head + css_extra + "</style>\n\n" + header + '\n\n<main class="wrap">\n\n' + corpo +
        "\n</main>\n" + footer + "\n\n" + script + "\n")
open(os.path.join(R, "morada.html"), "w", encoding="utf-8").write(html)
print(len(html))
