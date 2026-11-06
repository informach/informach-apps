"""Gera a v3 da proposta do Morada a partir da v2 (morada.html), aplicando o relatório de mercado
(Bloxburg, RoVille, RoCitizens) e as decisões tomadas depois da v2 (pacotes ITHappy, Recreio, licença)."""
import re
import sys

ARQ = sys.argv[1]
s = open(ARQ, encoding="utf-8").read()


def rep(a, b, n=1):
    global s
    assert s.count(a) >= 1, "não achei: " + a[:90]
    s = s.replace(a, b, n)


def entre(ini, fim, novo):
    """Troca tudo de ini (inclusive) até fim (exclusive)."""
    global s
    i = s.index(ini)
    j = s.index(fim, i)
    s = s[:i] + novo + s[j:]


# ------------------------------------------------------------------ CSS extra (figuras e listas de "levamos")
rep("footer{max-width:1180px", """.fig{margin:0;display:grid;gap:8px;min-width:0}
.fig img{width:100%;height:auto;display:block;border-radius:16px;background:var(--surface-2)}
.fig figcaption{font-size:13.5px;color:var(--muted)}
.take{font-size:13.5px;background:var(--soft,var(--surface-2));padding:10px 12px;border-radius:10px}
.big{font-family:var(--f-display);font-size:28px;font-weight:800;line-height:1;color:var(--c,var(--ink));font-variant-numeric:tabular-nums}
.stat{display:grid;gap:6px;background:var(--surface);padding:18px;border-radius:14px;min-width:0}
.stat span{font-size:13.5px;color:var(--muted)}
footer{max-width:1180px""")

# ------------------------------------------------------------------ navegação
rep('<a href="#visao">Visão</a><a href="#mundo">Mundo compartilhado</a><a href="#npcs">NPCs e solo</a><a href="#servicos">Serviços</a><a href="#simulacao">Simulação</a><a href="#telas">Telas</a><a href="#tecnica">Técnica</a><a href="#arte">Arte</a><a href="#desempenho">Desempenho</a><a href="#fases">Fases</a><a href="#riscos">Riscos</a>',
    '<a href="#visao">Visão</a><a href="#mercado">Mercado</a><a href="#personagens">Personagens</a><a href="#construcao">Construção</a><a href="#familia">Família e trabalho</a><a href="#mundo">Mundo compartilhado</a><a href="#npcs">NPCs e solo</a><a href="#servicos">Serviços</a><a href="#simulacao">Simulação</a><a href="#telas">Telas</a><a href="#recreio">Recreio</a><a href="#tecnica">Técnica</a><a href="#arte">Arte</a><a href="#desempenho">Desempenho</a><a href="#fases">Fases</a><a href="#riscos">Riscos</a>')

# ------------------------------------------------------------------ hero
rep('<span class="eyebrow" style="--c:var(--tangerine)">Proposta de jogo · v1</span>',
    '<span class="eyebrow" style="--c:var(--tangerine)">Proposta de jogo · v3</span>')
rep('<p class="tagline">Um jogo de vida em comunidade, low poly, para jogar com a família e os amigos no mesmo mundo, ao mesmo tempo.</p>',
    '<p class="tagline">Um simulador de vida de verdade, com família viva e autônoma, para jogar com a família e os amigos no mesmo mundo, ao mesmo tempo, direto no navegador.</p>')
rep('<span class="tag" style="--soft:var(--tangerine-soft);--c:var(--tangerine)">Arte por script no Blender</span>',
    '<span class="tag" style="--soft:var(--tangerine-soft);--c:var(--tangerine)">Arte de estúdio licenciada</span>')
rep('<span class="tag" style="--soft:var(--leaf-soft);--c:var(--leaf)">Modo solo, até offline</span>',
    '<span class="tag" style="--soft:var(--leaf-soft);--c:var(--leaf)">Modo solo, até offline</span>\n      <span class="tag" style="--soft:var(--sun-soft);--c:var(--sun)">Dentro da assinatura do Recreio</span>')
rep('<div class="hero-meta"><span>Nome e moeda provisórios</span><span>2 nov 2026</span></div>',
    '<div class="hero-meta"><span>Nome e moeda provisórios</span><span>3 nov 2026</span><span>v3: mercado, personagens, construção, família e negócio</span></div>')

# ------------------------------------------------------------------ visão: pilar de arte e tabela
rep('''      <h3>Feito por nós, por script</h3>
      <p class="small">Toda a arte low poly sai de scripts do Blender rodando sem interface: reproduzível, versionada no repositório e gerada no CI.</p>''',
    '''      <h3>Arte de estúdio, pipeline nosso</h3>
      <p class="small">Personagens, roupas, móveis e cidade feitos à mão pela ITHappy Studios, num estilo só. Nossos scripts do Blender convertem, recolorem e adaptam (bebês, piscar, fala), sem abrir a interface.</p>''')
rep('<tr><td>Arte</td><td>Estilizada, dezenas de GB</td><td><strong>Low poly com uma paleta única</strong>, gerada por script</td></tr>',
    '<tr><td>Arte</td><td>Estilizada, dezenas de GB</td><td><strong>Cartoon low poly com uma paleta só</strong>: 300 personagens, 1.100 roupas e 1.000 móveis licenciados</td></tr>\n        <tr><td>Família</td><td>Família inteira controlável e autônoma</td><td><strong>O mesmo</strong>, e ainda com várias pessoas reais morando juntas</td></tr>\n        <tr><td>Modelo de negócio</td><td>Jogo base mais pacotes de expansão</td><td><strong>Assinatura do Recreio</strong>, tudo incluído, sem moeda premium</td></tr>')

# ------------------------------------------------------------------ novas seções depois da visão
NOVAS = '''
<!-- MERCADO -->
<section id="mercado">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--teal)">O que o mercado já provou</span>
    <h2>Bloxburg, RoVille e RoCitizens provam a demanda; nenhum entrega a família viva</h2>
    <p class="lead">Os maiores simuladores de vida do Roblox mostram que construir a casa, trabalhar e conviver online prende muita gente por anos. Eles trocam a simulação profunda do gênero por roleplay entre jogadores. O Morada ocupa o espaço que sobra: família controlável e autônoma, com várias pessoas reais no mesmo mundo.</p>
  </div>
  <div class="grid g4">
    <div class="stat"><b class="big" style="--c:var(--teal)">10 bi+</b><span>visitas acumuladas do Welcome to Bloxburg</span></div>
    <div class="stat"><b class="big" style="--c:var(--sky)">12 · 16 · 40</b><span>jogadores por servidor em Bloxburg, RoVille e RoCitizens</span></div>
    <div class="stat"><b class="big" style="--c:var(--tangerine)">4</b><span>necessidades no Bloxburg (fome, energia, higiene, diversão)</span></div>
    <div class="stat"><b class="big" style="--c:var(--berry)">2019 →</b><span>RoVille crescendo por módulos: famílias e bebês só em 2023</span></div>
  </div>
  <div class="grid g3">
    <div class="card facet" style="--cut:18px">
      <span class="tag" style="--soft:var(--teal-soft);--c:var(--teal)">Welcome to Bloxburg</span>
      <h3>O editor de construção mais maduro</h3>
      <p class="small">Terreno de 30×30 (50×50 com passe), até 5 andares e porão com passes, grade ajustável, vista de cima, desfazer, pintura rápida, duplicar objetos e casas prontas para personalizar. Empregos pelo celular, contas que cortam a luz quando não pagas, permissões de visitante e coproprietário.</p>
      <p class="take" style="--soft:var(--teal-soft)"><b>Levamos:</b> as ferramentas do editor, plantas prontas, contas da casa e níveis de permissão.</p>
    </div>
    <div class="card facet" style="--cut:18px">
      <span class="tag" style="--soft:var(--berry-soft);--c:var(--berry)">RoVille</span>
      <h3>Um produto que cresceu por módulos</h3>
      <p class="small">Adoção de bebês NPC com editor, necessidades e crescimento para criança; escola, provas e graduação liberando empregos; negócios; construção em conjunto; mercado de casas; dia, noite e clima. Já em 2020 os autores cortaram a memória para menos de 1 GB e aceleraram o carregamento das casas em cerca de 5×.</p>
      <p class="take" style="--soft:var(--berry-soft)"><b>Levamos:</b> bebês que crescem, escola ligada às carreiras, construção conjunta e orçamento de memória desde o início.</p>
    </div>
    <div class="card facet" style="--cut:18px">
      <span class="tag" style="--soft:var(--sky-soft);--c:var(--sky)">RoCitizens</span>
      <h3>Vida urbana e profissões</h3>
      <p class="small">Muitos empregos diferentes, personalização, casas, carros, itens colecionáveis, comércio e interação entre jogadores. Chegou a ser conhecido como RoSims.</p>
      <p class="take" style="--soft:var(--sky-soft)"><b>Levamos:</b> variedade de carreiras e uma progressão econômica leve, sem virar planilha.</p>
    </div>
  </div>
  <h3>Onde o Morada se posiciona</h3>
  <div class="tbl">
    <table class="vs">
      <thead><tr><th>Tema</th><th>Simuladores do Roblox</th><th>Morada</th></tr></thead>
      <tbody>
        <tr><td>Quem você controla</td><td>O próprio avatar; família é roleplay entre jogadores</td><td><strong>Seu personagem e os NPCs da casa</strong>; no solo, a família inteira</td></tr>
        <tr><td>Autonomia</td><td>Limitada ou só em NPCs específicos</td><td><strong>IA de utilidade em todo personagem</strong>, inclusive no seu quando a fila esvazia</td></tr>
        <tr><td>Personalidade e humor</td><td>Sem equivalente completo</td><td><strong>Traços, sensações e humor</strong> mudando decisões e resultados</td></tr>
        <tr><td>Relacionamentos</td><td>Encenados pelos jogadores</td><td><strong>Simulados entre NPCs</strong> e com convite e aceite entre pessoas</td></tr>
        <tr><td>Ciclo de vida</td><td>Parcial (bebês NPC no RoVille)</td><td><strong>Seis fases, do colo à velhice</strong>, configuráveis por mundo</td></tr>
        <tr><td>Serviços da casa</td><td>Não documentado</td><td><strong>Contratos com agenda, salário e vários funcionários</strong></td></tr>
        <tr><td>Com quem se joga</td><td>Servidores públicos com desconhecidos</td><td><strong>Mundos privados</strong> de família e amigos</td></tr>
        <tr><td>Como se paga</td><td>Grátis, com passes e moeda premium</td><td><strong>Assinatura do Recreio, tudo incluído</strong></td></tr>
        <tr><td>Onde roda</td><td>Dentro do Roblox, com conta Roblox</td><td><strong>Navegador próprio</strong>, conta Informach</td></tr>
      </tbody>
    </table>
  </div>
  <div class="grid g2">
    <div class="card facet" style="background:var(--berry-soft)">
      <h4>O que não copiamos</h4>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:4px">
        <li>Passes que vendem terreno maior, andares extras, menos perda de necessidades ou salário maior.</li>
        <li>Moeda premium para acelerar a vida do personagem.</li>
        <li>Servidores abertos a desconhecidos, difíceis de moderar com crianças.</li>
        <li>Nomes, interface, ícones ou marcas do gênero: a ideia de jogo é livre, a expressão criativa não.</li>
      </ul>
    </div>
    <div class="card facet">
      <h4>O que a pesquisa confirma sobre construir</h4>
      <p class="small">Esses jogos não simulam a cidade inteira em profundidade e mesmo assim prendem. A lição para o Morada é começar por <b>uma casa funcional</b> (personagens, construção, móveis com comportamento e necessidades) e crescer por módulos, como o RoVille fez. Ver <a href="#fases">Fases</a>.</p>
    </div>
  </div>
  <p class="caption">Fonte: relatório de pesquisa de 3 nov 2026, com base nas descrições oficiais, no site da Bloxburg Development e no histórico público do RoVille. Não houve acesso ao código dos jogos; números de servidores e visitas são da data da pesquisa.</p>
</section>

<!-- PERSONAGENS -->
<section id="personagens">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--berry)">Personagens e criação</span>
    <h2>Seis tipos de corpo, 1.100 roupas e dez expressões, montados como no editor do gênero</h2>
    <p class="lead">O personagem é um corpo-base com peças trocáveis no mesmo esqueleto humanoide, compatível com Mixamo. Tudo vem do City Characters, da ITHappy Studios, feito à mão por artistas. O que falta (bebê de colo, criança pequena, piscar e fala) nós fazemos por script a partir do próprio pacote.</p>
  </div>
  <div class="grid g2">
    <figure class="fig"><img src="img/familia_idades.webp" alt="Adulto do pacote ao lado de uma criança pequena e de um bebê adaptados por script" loading="lazy" width="1200" height="857"><figcaption>Teste com o pacote grátis: adulto original, criança de 2 a 3 anos e bebê de colo adaptados por script (só peças do pacote). Com o corpo de criança do pacote completo o resultado fica mais natural.</figcaption></figure>
    <figure class="fig"><img src="img/editor_cores.webp" alt="Editor no navegador trocando cores de cabelo, pele, calça e tênis de um personagem" loading="lazy" width="1200" height="760"><figcaption>Protótipo em Three.js: peças de pacotes diferentes no mesmo esqueleto, cores trocadas ao vivo pela paleta, expressões e animações do pacote.</figcaption></figure>
  </div>
  <div class="tbl">
    <table>
      <thead><tr><th>Fase de vida</th><th>Corpo</th><th>De onde vem</th></tr></thead>
      <tbody>
        <tr><td><b>Bebê de colo</b></td><td>Adaptado do corpo de criança</td><td>Script: proporções de bebê e poses próprias (colo, berço, carrinho, cadeirão, engatinhar)</td></tr>
        <tr><td><b>Criança pequena</b></td><td>Adaptado do corpo de criança</td><td>Script: proporções de 2 a 4 anos; usa as animações da criança</td></tr>
        <tr><td><b>Criança</b></td><td>Criança (masculino e feminino)</td><td>Pacote</td></tr>
        <tr><td><b>Adolescente</b></td><td>Adolescente (masculino e feminino)</td><td>Pacote</td></tr>
        <tr><td><b>Adulto</b></td><td>Adulto, plus-size e musculoso</td><td>Pacote</td></tr>
        <tr><td><b>Idoso</b></td><td>Idoso (masculino e feminino)</td><td>Pacote</td></tr>
      </tbody>
    </table>
  </div>
  <div class="grid g3">
    <div class="card facet"><h4>Aparência</h4><p class="small">Quatro tons de pele do pacote e variações pela paleta, dezenas de cabelos por tipo de corpo, barbas e bigodes, chapéus, óculos, joias e bolsas. Toda peça muda de cor pela paleta, sem textura nova por personagem.</p></div>
    <div class="card facet"><h4>Roupas por tipo de corpo</h4><p class="small">Cada roupa é feita para um tipo de corpo e gênero: mais de 400 no adulto, 250 no plus-size, 220 no idoso e 140 na criança. O editor só mostra o que serve no corpo escolhido.</p></div>
    <div class="card facet"><h4>Envelhecer sem perder o estilo</h4><p class="small">Cada peça ganha etiquetas de categoria, cor e estilo. Ao mudar de fase, o jogo troca cada peça pela equivalente mais parecida do novo corpo e o jogador confirma ou ajusta.</p></div>
    <div class="card facet"><h4>Rosto e expressões</h4><p class="small">Dez expressões por tipo de corpo, como peças de rosto trocáveis; o humor do personagem escolhe a expressão. Para piscar e falar, geramos por script versões de olhos fechados e boca aberta a partir das próprias peças, que o jogo alterna.</p></div>
    <div class="card facet"><h4>Animações</h4><p class="small">150 do pacote, de 15 a 25 por tipo de corpo: andar, correr, sentar, relaxar, conversar, gesticular, celular, beber, comer, acenar, compras. O que faltar (dormir, cozinhar, banho, colo) vem do Mixamo no mesmo esqueleto; as em par, por script.</p></div>
    <div class="card facet"><h4>Bichos de estimação</h4><p class="small">Treze animais: cinco raças de cachorro e três gatos, em variações de cor, com sentar, deitar, dormir, pedir para brincar e dar a pata. Entram como NPCs da casa, com necessidades próprias.</p></div>
  </div>
</section>

<!-- CONSTRUÇÃO -->
<section id="construcao">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--sky)">Construção e casas</span>
    <h2>A casa é um documento de dados; o navegador monta paredes e móveis</h2>
    <p class="lead">Como nos melhores editores do gênero, a casa não é um modelo 3D fechado: é uma lista de paredes, aberturas, pisos e objetos. Isso permite salvar, copiar, desfazer, compartilhar plantas e o servidor validar cada mudança.</p>
  </div>
  <div class="grid g2">
    <figure class="fig"><img src="img/sala.webp" alt="Sala e cozinha em vista isométrica com móveis, dois personagens e um cachorro" loading="lazy" width="1400" height="875"><figcaption>Sala de teste montada só com peças dos pacotes grátis (móveis, personagens com as próprias animações e o cachorro). Paredes e piso provisórios: no jogo, vêm do sistema modular do Cute Furniture.</figcaption></figure>
    <div style="display:grid;gap:22px;min-width:0">
      <div class="code-head"><span>casa_ipe.json · documento salvo no servidor</span><span>exemplo</span></div>
<pre>{
  <span class="s">"lote"</span>: { <span class="s">"id"</span>: <span class="s">"ipe-07"</span>, <span class="s">"tamanho"</span>: [<span class="n">30</span>, <span class="n">30</span>] },
  <span class="s">"andares"</span>: [{
    <span class="s">"nivel"</span>: <span class="n">0</span>,
    <span class="s">"paredes"</span>: [{
      <span class="s">"id"</span>: <span class="s">"p1"</span>, <span class="s">"de"</span>: [<span class="n">0</span>, <span class="n">0</span>], <span class="s">"ate"</span>: [<span class="n">6</span>, <span class="n">0</span>],
      <span class="s">"altura"</span>: <span class="n">2.7</span>, <span class="s">"textura"</span>: <span class="s">"papel_listras_03"</span>,
      <span class="s">"aberturas"</span>: [
        { <span class="s">"item"</span>: <span class="s">"porta_classica_02"</span>, <span class="s">"em"</span>: <span class="n">1.2</span> },
        { <span class="s">"item"</span>: <span class="s">"janela_dupla_05"</span>, <span class="s">"em"</span>: <span class="n">4.0</span>, <span class="s">"altura"</span>: <span class="n">0.9</span> }
      ]
    }],
    <span class="s">"pisos"</span>: [{ <span class="s">"comodo"</span>: <span class="s">"sala"</span>, <span class="s">"textura"</span>: <span class="s">"madeira_07"</span> }],
    <span class="s">"objetos"</span>: [{
      <span class="s">"item"</span>: <span class="s">"sofa_08"</span>, <span class="s">"pos"</span>: [<span class="n">2.3</span>, <span class="n">0</span>, <span class="n">5.0</span>], <span class="s">"rot"</span>: <span class="n">180</span>,
      <span class="s">"cores"</span>: { <span class="s">"principal"</span>: <span class="s">"azul_claro"</span> }   <span class="c">// ponto da paleta</span>
    }]
  }]
}</pre>
    </div>
  </div>
  <div class="grid g3">
    <div class="card facet"><h4>Ferramentas do editor</h4><p class="small">Grade de 0,5 m com encaixe, vista de cima e em perspectiva, paredes arrastadas com portas e janelas encaixando sozinhas, pintar paredes e pisos, copiar e espelhar cômodos, desfazer e refazer com histórico por autor, e trava por cômodo na construção conjunta.</p></div>
    <div class="card facet"><h4>Paredes e aberturas</h4><p class="small">Uma parede é um segmento com início, fim, altura e textura; portas e janelas são intervalos recortados nele. Enquanto o jogador arrasta, só o segmento alterado é reconstruído, o que mantém o editor leve no navegador.</p></div>
    <div class="card facet"><h4>Lotes e andares</h4><p class="small">Lotes pequeno (20×20), médio (30×30) e grande (40×40) e até 3 andares no lançamento; porão depois. Nada disso é vendido à parte: faz parte da assinatura.</p></div>
    <div class="card facet"><h4>Plantas prontas e compartilhadas</h4><p class="small">Um catálogo de casas prontas para começar sem construir do zero, e plantas que a família ou os amigos do mundo trocam entre si. A planta guarda só referências aos itens do catálogo, nunca os arquivos 3D, o que respeita a licença dos assets.</p></div>
    <div class="card facet"><h4>Contas da casa</h4><p class="small">Luz e água por semana, calculadas pelo que a casa usou. Sem pagar: aviso, multa e, por fim, a luz desligada (aparelhos elétricos param) até quitar. Ninguém perde a casa nem os móveis.</p></div>
    <div class="card facet"><h4>Peças do Cute Furniture</h4><p class="small">19 peças de parede (lisa, com porta, com janela, arcos), 57 portas, 38 janelas, piso modular com 42 texturas e 1.000 móveis e objetos, com armários e portas que abrem. A cozinha sozinha tem 310 itens.</p></div>
  </div>
  <h3>Móveis com comportamento</h3>
  <div class="tbl">
    <table>
      <thead><tr><th>Objeto</th><th>Ações</th><th>O que afeta</th></tr></thead>
      <tbody>
        <tr><td>Cama</td><td>Deitar, dormir, namorar (adultos), ler</td><td>Energia, conforto, relacionamento</td></tr>
        <tr><td>Berço</td><td>Pôr para dormir, ninar, tirar do berço</td><td>Sono do bebê, vínculo com o adulto</td></tr>
        <tr><td>Geladeira</td><td>Abrir, pegar lanche, pegar ingredientes</td><td>Fome, estoque da casa</td></tr>
        <tr><td>Fogão</td><td>Cozinhar refeição, cozinhar para todos</td><td>Fome, habilidade de cozinhar, risco de incêndio</td></tr>
        <tr><td>Chuveiro e banheira</td><td>Tomar banho, dar banho no bebê</td><td>Higiene, conta de água</td></tr>
        <tr><td>TV</td><td>Assistir, jogar videogame</td><td>Diversão, conta de luz</td></tr>
        <tr><td>Sofá</td><td>Sentar, cochilar, conversar</td><td>Energia, social</td></tr>
        <tr><td>Computador</td><td>Jogar, estudar, trabalhar de casa</td><td>Diversão, habilidade, dinheiro</td></tr>
        <tr><td>Porta</td><td>Abrir, fechar, trancar</td><td>Acesso, privacidade, permissões</td></tr>
      </tbody>
    </table>
  </div>
  <p class="caption">Cada tipo de objeto tem um componente de comportamento (pontos de uso, ações, animações e condições). Todos os sofás compartilham o mesmo comportamento, então um móvel novo do catálogo entra no jogo só com dados.</p>
</section>

<!-- FAMÍLIA E TRABALHO -->
<section id="familia">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--leaf)">Família, escola e trabalho</span>
    <h2>Bebês que crescem, crianças que vão à escola e adultos com carreira</h2>
    <p class="lead">É aqui que o Morada vai além dos simuladores do Roblox: a família tem ciclo de vida, rotina e progressão própria, mesmo quando ninguém está dirigindo.</p>
  </div>
  <div class="ladder" aria-label="Fases de vida">
    <div class="step k">Bebê de colo<small>NPC da casa</small></div><span class="arrow-r" aria-hidden="true">→</span>
    <div class="step k">Criança pequena<small>anda, brinca, fala pouco</small></div><span class="arrow-r" aria-hidden="true">→</span>
    <div class="step">Criança<small>escola e dever de casa</small></div><span class="arrow-r" aria-hidden="true">→</span>
    <div class="step">Adolescente<small>escola, amigos, primeiro emprego</small></div><span class="arrow-r" aria-hidden="true">→</span>
    <div class="step">Adulto<small>carreira, romance, família</small></div><span class="arrow-r" aria-hidden="true">→</span>
    <div class="step">Idoso<small>aposentadoria, netos</small></div>
  </div>
  <div class="grid g3">
    <div class="card facet"><h4>Chegada do bebê</h4><p class="small">Por gravidez (evento de alguns dias de jogo, sem conteúdo explícito) ou adoção. Quando os dois adultos são jogadores, os dois aceitam. A aparência é sugerida a partir dos pais (tom de pele, cor de cabelo) e dá para ajustar na hora.</p></div>
    <div class="card facet"><h4>Bebê de colo</h4><p class="small">NPC da casa com necessidades próprias: fome, sono, fralda e carinho. Vive no colo, no berço, no carrinho, no cadeirão e no tapete. Precisa de um adulto por perto ou da babá contratada.</p></div>
    <div class="card facet"><h4>Crescer</h4><p class="small">Cada fase libera interações e troca o corpo, com as roupas equivalentes do novo tipo de corpo. A duração das fases é configurável por mundo, e o envelhecimento pode ser desligado.</p></div>
    <div class="card facet"><h4>Escola</h4><p class="small">Crianças e adolescentes vão à escola em horário fixo, fora do lote. O dever de casa afeta as notas; notas e formatura liberam carreiras melhores, como no RoVille.</p></div>
    <div class="card facet"><h4>Trabalho, de dois jeitos</h4><p class="small">Turno fora do lote (o personagem sai e volta com salário e experiência) ou turno ativo, com tarefas curtas no local (cafeteria, salão, consultório) para quem quer jogar o trabalho. Uniformes das 90 profissões do pacote.</p></div>
    <div class="card facet"><h4>Habilidades</h4><p class="small">Cozinhar, lógica, carisma, criatividade, condicionamento e cuidar de crianças. Sobem com o uso, mudam a chance de sucesso das ações e liberam promoções.</p></div>
  </div>
  <div class="tbl">
    <table>
      <thead><tr><th>Carreiras no lançamento</th><th>Turno</th><th>Uniforme do pacote</th></tr></thead>
      <tbody>
        <tr><td>Culinária (ajudante, cozinheiro, chef)</td><td>Ativo na cafeteria ou fora do lote</td><td>Cozinheiro</td></tr>
        <tr><td>Saúde (enfermagem, medicina)</td><td>Fora do lote; plantões</td><td>Médico, socorrista</td></tr>
        <tr><td>Educação (professor)</td><td>Fora do lote; dias de semana</td><td>Professor</td></tr>
        <tr><td>Beleza (cabeleireiro)</td><td>Ativo no salão</td><td>Cabeleireiro</td></tr>
        <tr><td>Segurança (polícia, bombeiros)</td><td>Fora do lote; escalas</td><td>Policial, bombeiro</td></tr>
        <tr><td>Construção e projetos (arquiteto)</td><td>Fora do lote; pode trabalhar de casa</td><td>Arquiteto, pedreiro</td></tr>
        <tr><td>Serviços da casa (diarista, babá, jardinagem)</td><td>Também como NPC contratado</td><td>Diarista, faxineira, jardineiro</td></tr>
      </tbody>
    </table>
  </div>
</section>
'''
rep('<!-- MUNDO COMPARTILHADO -->', NOVAS + '\n<!-- MUNDO COMPARTILHADO -->')

# ------------------------------------------------------------------ simulação: fases de vida
rep('<p class="small muted">Idades: bebê, criança, adolescente, adulto e idoso. O envelhecimento é configurável por mundo e pode ser desligado.</p>',
    '<p class="small muted">Fases: bebê de colo, criança pequena, criança, adolescente, adulto e idoso (ver <a href="#familia">Família e trabalho</a>). O envelhecimento é configurável por mundo e pode ser desligado.</p>')

# ------------------------------------------------------------------ telas: criação de personagem
entre('<div class="gp" style="left:20px;top:20px;bottom:20px;width:210px;display:grid;gap:8px;align-content:start">\n        <div class="gh">Criar personagem</div>',
      '      </div>\n      <div data-char="1"',
      '''<div class="gp" style="left:20px;top:20px;bottom:20px;width:210px;display:grid;gap:8px;align-content:start">
        <div class="gh">Criar personagem</div>
        <span class="gchip on">Corpo</span><span class="gchip">Rosto</span><span class="gchip">Cabelo</span><span class="gchip">Roupas</span><span class="gchip">Personalidade</span>
        <div style="margin-top:10px;display:grid;gap:8px;font-size:12px">
          <b style="color:#565C82">TIPO DE CORPO</b>
          <div style="display:flex;flex-wrap:wrap;gap:5px"><span class="gchip on">Adulto</span><span class="gchip">Plus-size</span><span class="gchip">Musculoso</span><span class="gchip">Idoso</span><span class="gchip">Adolescente</span><span class="gchip">Criança</span></div>
          <b style="color:#565C82;margin-top:4px">TOM DE PELE</b>
          <div style="display:flex;gap:6px"><i class="sw" style="--c:#F6CDB3"></i><i class="sw" style="--c:#E9A87E;outline:3px solid #1A1D3A"></i><i class="sw" style="--c:#B97354"></i><i class="sw" style="--c:#5A3426"></i></div>
          <b style="color:#565C82;margin-top:4px">EXPRESSÃO DE TESTE</b>
          <div style="display:flex;flex-wrap:wrap;gap:5px"><span class="gchip on">Feliz</span><span class="gchip">Bravo</span><span class="gchip">Surpreso</span></div>
        </div>
''')
rep('<span class="gbtn">Roupa: dia a dia</span></div>', '<span class="gbtn">Roupa: dia a dia</span></div>', 1)
rep('''        <li>Sliders mexem em formas do corpo e do rosto, aplicadas uma vez ao salvar: custo zero durante o jogo.</li>
        <li>Roupas e cabelos são malhas separadas no mesmo esqueleto, fundidas numa malha só ao carregar.</li>''',
    '''        <li>Escolha entre seis tipos de corpo do pacote (mais bebê e criança pequena, adaptados) e quatro tons de pele.</li>
        <li>Roupas e cabelos são peças separadas no mesmo esqueleto, filtradas pelo tipo de corpo e fundidas numa malha só ao carregar.</li>''')

# ------------------------------------------------------------------ nova seção: Recreio (antes da técnica)
RECREIO = '''
<!-- RECREIO -->
<section id="recreio">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--sun)">Dentro do Recreio</span>
    <h2>Assinatura com tudo incluído: sem moeda premium e sem passes</h2>
    <p class="lead">O Morada é o primeiro jogo do Recreio. Quem assina joga com o próprio perfil; o plano Família cobre até 4 perfis. Terreno maior, andares, móveis, roupas e carreiras fazem parte do jogo, não de uma loja.</p>
  </div>
  <div class="grid g4">
    <div class="stat"><b class="big" style="--c:var(--tangerine)">R$ 59,90</b><span>por mês, plano Individual do Recreio</span></div>
    <div class="stat"><b class="big" style="--c:var(--teal)">~R$ 127</b><span>por mês, plano Família, até 4 perfis</span></div>
    <div class="stat"><b class="big" style="--c:var(--sky)">0</b><span>moedas premium, passes ou anúncios</span></div>
    <div class="stat"><b class="big" style="--c:var(--berry)">100%</b><span>do conteúdo liberado para quem assina</span></div>
  </div>
  <div class="grid g3">
    <div class="card facet"><h4>O que não vendemos</h4><p class="small">Passes de terreno, andares ou velocidade, moeda premium, itens avulsos e anúncios. Além de ser a decisão do Recreio, a licença dos assets pede autorização por escrito para vender itens como objetos virtuais avulsos.</p></div>
    <div class="card facet"><h4>Quem joga com quem</h4><p class="small">Mundos privados de família e amigos. Convidados também precisam ter assinatura, como no resto do Recreio. Perfis infantis do plano Família vêm com romance desligado e chat filtrado.</p></div>
    <div class="card facet"><h4>Conteúdo novo incluso</h4><p class="small">Novos bairros, carreiras, coleções de móveis e roupas entram na assinatura, sem pacote de expansão pago. É o que mantém a assinatura viva mês a mês.</p></div>
  </div>
  <div class="card facet" style="--cut:18px">
    <h3>Licença dos assets (ITHappy, licença padrão)</h3>
    <div class="grid g2">
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:5px">
        <li><b>Pode:</b> usar em jogos comerciais e vender os jogos, inclusive por assinatura; quantos jogos quisermos.</li>
        <li><b>Pode:</b> modificar e adaptar (recolorir, bebês, trocar peças, converter para o navegador).</li>
        <li><b>Pode:</b> usar ferramentas de IA de desenvolvimento, como o Claude Code, com os arquivos.</li>
        <li><b>Pode:</b> usar em divulgação: prints, vídeos e trailers.</li>
        <li>Cada compra cobre <b>5 pessoas</b> da equipe técnica e criativa; agentes de IA não contam.</li>
      </ul>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:5px">
        <li><b>Não pode:</b> distribuir ou vender os arquivos soltos. No jogo: sem botão de exportar personagem e sem kit de mods com os assets.</li>
        <li><b>Não pode, sem autorização:</b> vender ou trocar os assets como itens virtuais avulsos, nem sublicenciar.</li>
        <li><b>Não pode:</b> NFT, treinar IA com os assets ou vender renders como produto (pôster, camiseta).</li>
        <li>Comprar no nome da <b>Informach</b>; avisar defeitos em até uma semana depois do download.</li>
      </ul>
    </div>
  </div>
</section>
'''
rep('<!-- TÉCNICA -->', RECREIO + '\n<!-- TÉCNICA -->')

# ------------------------------------------------------------------ técnica: mais três cartões
rep('''    <div class="card facet"><h4>Interesse por lote</h4>''', '''    <div class="card facet"><h4>Casa como documento</h4><p class="small">Cada casa é um documento JSON no Postgres (Drizzle). O servidor valida cada operação de construção (limites do lote, dinheiro, permissão) e grava só a operação, não a casa inteira: salvamento incremental e histórico com desfazer.</p></div>
    <div class="card facet"><h4>Física só onde precisa</h4><p class="small">Rapier no modo cinemático para colisões do personagem e objetos que caem (bola, brinquedos). Móveis são estáticos com colisores simples; ninguém empurra o sofá por física.</p></div>
    <div class="card facet"><h4>Navegação que acompanha a obra</h4><p class="small">Navmesh com Recast em WebAssembly, reconstruída só no trecho alterado quando alguém ergue uma parede ou move um móvel. Se a cozinha ficar inacessível, o personagem recalcula a rota ou avisa que não consegue chegar.</p></div>
    <div class="card facet"><h4>Interesse por lote</h4>''')

# ------------------------------------------------------------------ arte: seção nova
ARTE = '''<!-- ARTE -->
<section id="arte">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--tangerine)">Arte</span>
    <h2>Arte de estúdio licenciada, adaptada por scripts no Blender</h2>
    <p class="lead">Testamos fazer a arte do zero por script e com IA geradora de modelos: não chegou na qualidade que o jogo pede. A decisão é usar três pacotes da ITHappy Studios, no mesmo estilo e no mesmo esqueleto, e concentrar nossos scripts no que os pacotes não fazem.</p>
  </div>
  <div class="grid g3">
    <div class="card facet" style="background:var(--berry-soft)"><span class="tag" style="--soft:var(--surface);--c:var(--berry)">City Characters</span><h3>Pessoas e bichos</h3><p class="small">300 personagens prontos, 6 tipos de corpo em 4 tons de pele, 1.100 roupas e acessórios, 10 expressões por tipo, 150 animações do dia a dia, 100 objetos de mão e 13 animais. Cerca de 6 mil triângulos por personagem.</p></div>
    <div class="card facet" style="background:var(--sky-soft)"><span class="tag" style="--soft:var(--surface);--c:var(--sky)">Cute Furniture</span><h3>Casa por dentro</h3><p class="small">1.000 móveis e objetos (cerca de 1,5 mil triângulos cada), paredes, portas e janelas modulares, piso com 42 texturas e armários que abrem.</p></div>
    <div class="card facet" style="background:var(--teal-soft)"><span class="tag" style="--soft:var(--surface);--c:var(--teal)">Cartoon City</span><h3>Bairro e cidade</h3><p class="small">Mais de 600 peças de cidade (prédios, ruas, praças, parques, praia) e 60 veículos. Os prédios não têm interior: casas e lojas por dentro saem do Cute Furniture.</p></div>
  </div>
  <div class="dg" role="img" aria-label="Pipeline de arte: pacote, normalizar, catalogar, adaptar, otimizar e publicar">
    <svg viewBox="0 0 960 300">
      <defs><marker id="ar-p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="mk" d="M0 0L10 5L0 10z"/></marker></defs>
      <rect class="warm" x="24" y="40" width="272" height="70" rx="12"/><text class="t" x="160" y="70" text-anchor="middle">1 · Pacotes ITHappy</text><text class="sub" x="160" y="90" text-anchor="middle">FBX, texturas de paleta, animações</text>
      <rect class="box" x="348" y="40" width="272" height="70" rx="12"/><text class="t" x="484" y="70" text-anchor="middle">2 · Blender -b: normalizar</text><text class="sub" x="484" y="90" text-anchor="middle">escala, esqueleto padrão, nomes</text>
      <rect class="box" x="672" y="40" width="272" height="70" rx="12"/><text class="t" x="808" y="70" text-anchor="middle">3 · Catalogar</text><text class="sub" x="808" y="90" text-anchor="middle">etiquetas: corpo, categoria, estilo, cor</text>
      <rect class="box" x="24" y="180" width="272" height="70" rx="12"/><text class="t" x="160" y="210" text-anchor="middle">4 · Adaptar</text><text class="sub" x="160" y="230" text-anchor="middle">bebês, piscar, fala, poses, LOD</text>
      <rect class="box" x="348" y="180" width="272" height="70" rx="12"/><text class="t" x="484" y="210" text-anchor="middle">5 · Animações extras</text><text class="sub" x="484" y="230" text-anchor="middle">Mixamo no mesmo esqueleto, em par</text>
      <rect class="good" x="672" y="180" width="272" height="70" rx="12"/><text class="t" x="808" y="210" text-anchor="middle">6 · Otimizar e publicar</text><text class="sub" x="808" y="230" text-anchor="middle">GLB com meshopt, KTX2, manifesto</text>
      <g class="ar">
        <path d="M296 75H346" marker-end="url(#ar-p)"/><path d="M620 75H670" marker-end="url(#ar-p)"/>
        <path d="M808 110V145H160V178" marker-end="url(#ar-p)"/>
        <path d="M296 215H346" marker-end="url(#ar-p)"/><path d="M620 215H670" marker-end="url(#ar-p)"/>
      </g>
      <text class="sub" x="24" y="282">Os arquivos originais nunca vão para o jogo: só GLBs comprimidos e empacotados, sem opção de exportar, como pede a licença.</text>
    </svg>
  </div>
  <div class="grid g2">
    <figure class="fig"><img src="img/moveis.webp" alt="Todos os móveis do pacote grátis do Cute Furniture dispostos numa grade" loading="lazy" width="1200" height="800"><figcaption>Amostra grátis do Cute Furniture renderizada pelo nosso pipeline: 48 móveis e objetos, 70 mil triângulos no total, uma paleta de cores compartilhada com os personagens.</figcaption></figure>
    <div style="display:grid;gap:16px;align-content:start;min-width:0">
      <div class="card facet">
        <h3>Já validado com os pacotes grátis</h3>
        <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:5px">
          <li>Abrir, converter e exportar para o Three.js por script.</li>
          <li>Trocar peças entre personagens e pacotes no mesmo esqueleto.</li>
          <li>Trocar cores ao vivo no navegador pela paleta.</li>
          <li>Animações do pacote e do Mixamo no esqueleto do pacote.</li>
          <li>Montar um cômodo com móveis, personagens e cachorro.</li>
          <li>Bebê e criança pequena adaptados de outro corpo.</li>
        </ul>
      </div>
      <div class="card facet">
        <h3>Animações</h3>
        <p class="small">As do pacote cobrem o dia a dia na rua e em casa. As que faltarem (dormir, cozinhar, banho, colo) vêm do Mixamo, convertidas para o mesmo esqueleto. As em par (abraço, beijo, pegar no colo) são feitas por script com duas cópias do esqueleto e poses-chave. Locomoção sai "no lugar"; o servidor move o personagem pela rota.</p>
      </div>
    </div>
  </div>
  <div class="tbl">
    <table>
      <thead><tr><th>Grupo</th><th>Clipes</th><th>Origem</th></tr></thead>
      <tbody>
        <tr><td>Locomoção</td><td>parado, andar, correr, virar, carregar coisas</td><td>Pacote</td></tr>
        <tr><td>Posturas</td><td>sentar e levantar, relaxar, deitar</td><td>Pacote; dormir e acordar do Mixamo</td></tr>
        <tr><td>Social</td><td>conversar, gesticular, acenar, celular, foto, beber, comer</td><td>Pacote</td></tr>
        <tr><td>Casa</td><td>cozinhar, lavar louça, varrer, tomar banho, digitar</td><td>Mixamo, ajustadas por script</td></tr>
        <tr><td>Em par</td><td>abraço, beijo, aperto de mão, pegar bebê no colo</td><td>Script: duas cópias do esqueleto e poses-chave</td></tr>
        <tr><td>Bebês e crianças pequenas</td><td>colo, berço, carrinho, engatinhar, brincar</td><td>Poses por script sobre o corpo adaptado</td></tr>
        <tr><td>Bichos</td><td>andar, correr, sentar, deitar, dormir, latir, pedir para brincar</td><td>Pacote</td></tr>
      </tbody>
    </table>
  </div>
</section>

'''
entre('<!-- ARTE -->', '<!-- DESEMPENHO -->', ARTE)

# ------------------------------------------------------------------ desempenho: metas novas
rep('<p class="lead">A meta é 60 fps em notebook com vídeo integrado, o que dá 16,7 ms por quadro. O orçamento abaixo é a divisão alvo, medida em cada build de teste.</p>',
    '<p class="lead">A meta é 60 fps em notebook com vídeo integrado, o que dá 16,7 ms por quadro, e a aba do navegador abaixo de 1 GB de memória, lição que o RoVille aprendeu cedo. O orçamento abaixo é a divisão alvo, medida em cada build de teste.</p>')
rep('<tr><td>Personagem LOD0 / LOD1 / LOD2</td><td class="num">2.500 / 800 / 300 triângulos</td></tr>',
    '<tr><td>Personagem LOD0 / LOD1 / LOD2</td><td class="num">~6.000 / 2.500 / 800 triângulos</td></tr>')
rep('<tr><td>Ossos por personagem</td><td class="num">≤ 30</td></tr>', '<tr><td>Ossos por personagem</td><td class="num">44 do pacote; dedos parados longe da câmera</td></tr>')
rep('<tr><td>Móvel comum</td><td class="num">40 a 600 triângulos</td></tr>', '<tr><td>Móvel comum</td><td class="num">~1.500 triângulos</td></tr>')
rep('<tr><td>Lote inteiro visível</td><td class="num">≤ 150 mil triângulos</td></tr>', '<tr><td>Lote inteiro visível</td><td class="num">≤ 300 mil triângulos</td></tr>')
rep('<tr><td>Materiais</td><td class="num">paleta + rostos + vidro/água</td></tr>', '<tr><td>Materiais</td><td class="num">paletas dos pacotes + tecidos + vidro</td></tr>')
rep('<tr><td>Download para começar</td><td class="num">≤ 25 MB</td></tr>', '<tr><td>Download para começar</td><td class="num">≤ 35 MB</td></tr>\n          <tr><td>Memória da aba do navegador</td><td class="num">&lt; 1 GB</td></tr>')
rep('Meta de 60 fps em notebook com vídeo integrado e cerca de 25 MB para começar a jogar.', 'Meta de 60 fps em notebook com vídeo integrado e cerca de 35 MB para começar a jogar.')
rep('<div class="card facet"><h4>Renderização</h4><p class="small">Móveis estáticos do lote agrupados em <code>BatchedMesh</code>; repetidos (grama, cerca) em <code>InstancedMesh</code>. Um material com a textura de paleta,',
    '<div class="card facet"><h4>Renderização</h4><p class="small">Móveis estáticos do lote agrupados em <code>BatchedMesh</code>; repetidos (cadeiras iguais, grama, cerca) em <code>InstancedMesh</code>. Poucos materiais com as texturas de paleta dos pacotes,')
rep('Paredes da frente cortadas no shader, sem transparência.</p></div>', 'Paredes da frente cortadas no shader, sem transparência. Casas vizinhas aparecem numa versão simplificada até alguém entrar.</p></div>')

# ------------------------------------------------------------------ fases
entre('<!-- FASES -->', '<!-- RISCOS -->', '''<!-- FASES -->
<section id="fases">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--berry)">Fases</span>
    <h2>Sete fases, cada uma jogável no fim, começando por uma casa que funciona</h2>
    <p class="lead">Como o relatório recomenda e o RoVille demonstra, o valor do gênero aparece numa única casa funcional: criar personagens, construir, mobiliar, viver as necessidades. O multijogador fica pronto na arquitetura desde a fase 0, mas entra como experiência na fase 3, quando a casa já é divertida sozinha.</p>
  </div>
  <div class="grid g3">
    <div class="phase facet" style="--c:var(--tangerine);--soft:var(--tangerine-soft)"><span class="n">0</span><h3>Fundação</h3><ul><li>Comprar os pacotes e rodar o pipeline completo</li><li>Personagem do pacote animado no Three.js com piscar e fala</li><li>Servidor com dois jogadores andando no mesmo lote</li></ul><p class="exit"><b>Pronto quando:</b> 60 fps em notebook integrado e dois clientes vendo a mesma caminhada.</p></div>
    <div class="phase facet" style="--c:var(--sky);--soft:var(--sky-soft)"><span class="n">1</span><h3>Uma casa que funciona</h3><ul><li>Editor de personagem com os 6 tipos de corpo</li><li>Construção: paredes, portas, janelas, pisos, desfazer, salvar</li><li>Comprar móveis com comportamento</li><li>Seis necessidades e 30 interações, no modo solo</li></ul><p class="exit"><b>Pronto quando:</b> alguém de fora cria um personagem, constrói uma casa e vive uma semana de jogo nela.</p></div>
    <div class="phase facet" style="--c:var(--leaf);--soft:var(--leaf-soft)"><span class="n">2</span><h3>Família viva</h3><ul><li>Vários personagens na casa e troca pelo retrato</li><li>Autonomia, personalidade, humor e relacionamentos</li><li>Bebês, crianças pequenas e envelhecimento</li><li>Contas da casa e duas famílias NPC</li></ul><p class="exit"><b>Pronto quando:</b> uma família de quatro, com um bebê, vive um mês de jogo sem travar nem precisar de comando constante.</p></div>
    <div class="phase facet" style="--c:var(--berry);--soft:var(--berry-soft)"><span class="n">3</span><h3>Juntos</h3><ul><li>Mundos privados, presença e relógio do mundo</li><li>Convites, namoro, casamento, morar junto</li><li>Fundo da casa, permissões e construção conjunta</li><li>Abrir um save solo como mundo compartilhado</li></ul><p class="exit"><b>Pronto quando:</b> quatro pessoas jogam uma semana de jogo numa casa só.</p></div>
    <div class="phase facet" style="--c:var(--teal);--soft:var(--teal-soft)"><span class="n">4</span><h3>Trabalho e serviços</h3><ul><li>Carreiras, habilidades, escola</li><li>Turno fora do lote e turno ativo</li><li>Serviços avulsos e contratos com agenda</li></ul><p class="exit"><b>Pronto quando:</b> duas diaristas e duas babás trabalham uma semana sem conflito, com os adultos no emprego.</p></div>
    <div class="phase facet" style="--c:var(--sun);--soft:var(--sun-soft)"><span class="n">5</span><h3>Bairro e cidade</h3><ul><li>Vários lotes e o centro do Cartoon City</li><li>Comércio, praça, praia e lugares públicos</li><li>Mais famílias NPC com a vida avançando sozinha</li><li>Plantas prontas e compartilhadas</li></ul><p class="exit"><b>Pronto quando:</b> um mundo de 12 jogadores roda em 1 vCPU e a aba fica abaixo de 1 GB.</p></div>
    <div class="phase facet" style="--c:var(--sky);--soft:var(--sky-soft)"><span class="n">6</span><h3>Lançamento no Recreio</h3><ul><li>Conteúdo, áudio e acessibilidade</li><li>Tablet e celular</li><li>Moderação, backups e painel do anfitrião completo</li></ul><p class="exit"><b>Pronto quando:</b> uma família de fora assina, joga e convida outra sem ajuda do time.</p></div>
  </div>
</section>

''')

# ------------------------------------------------------------------ riscos e decisões
rep('<tr><td>Animações em par (abraço, beijo, colo)</td><td>Alto</td><td>Protótipo na fase 0; poses-chave por script com IK assado; aceitar estilo simples e expressivo.</td></tr>',
    '''<tr><td>Animações em par (abraço, beijo, colo)</td><td>Alto</td><td>Protótipo na fase 0; poses-chave por script com IK assado; aceitar estilo simples e expressivo.</td></tr>
        <tr><td>Bebês e crianças pequenas adaptados</td><td>Médio</td><td>Partir do corpo de criança do pacote; bebê com poucas poses (colo, berço, carrinho, engatinhar), como no gênero.</td></tr>
        <tr><td>Roupas existem só para um tipo de corpo</td><td>Médio</td><td>Etiquetas de categoria e estilo; troca automática pela peça equivalente ao envelhecer, com confirmação do jogador.</td></tr>
        <tr><td>Concorrência gratuita no Roblox</td><td>Médio</td><td>Público família e assinantes do Recreio: mundos privados, sem anúncios nem passes, em português, com a família viva que o Roblox não tem.</td></tr>
        <tr><td>Uso dos assets fora do que a licença permite</td><td>Médio</td><td>Sem exportação nem mods com os arquivos, sem venda de itens avulsos; arquivos só empacotados no jogo.</td></tr>''')
rep('<tr><td>Escopo do gênero é enorme</td><td>Alto</td><td>Fases jogáveis e conteúdo em dados; sistemas novos só depois de a fase anterior estar estável.</td></tr>',
    '<tr><td>Escopo do gênero é enorme</td><td>Alto</td><td>Começar por uma casa funcional, crescer por módulos como o RoVille, conteúdo em dados; sistemas novos só depois de a fase anterior estar estável.</td></tr>')
rep('<tr><td>Desempenho em celular</td><td>Médio</td><td>LOD2 e resolução dinâmica; celular só na fase 5.</td></tr>',
    '<tr><td>Desempenho em celular</td><td>Médio</td><td>LOD2 e resolução dinâmica; celular só na fase 6.</td></tr>')
rep('''      <li>Se o jogo terá venda, assinatura ou será só para o grupo, o que muda billing, hospedagem e licenças.</li>''',
    '''      <li>Gravidez e adoção, ou só adoção no lançamento.</li>
      <li>Tamanhos de lote e número de andares no lançamento (proposta: três lotes e até 3 andares).</li>
      <li>Quais carreiras têm turno ativo no lançamento (proposta: culinária e beleza).</li>''')
rep('<li>Só navegador, ou também um app de desktop com o Electron que o monorepo já usa.</li>',
    '<li>Só navegador, ou também um app de desktop com o Electron que o monorepo já usa (o Recreio já prevê um lançador para o futuro).</li>')

# ------------------------------------------------------------------ rodapé e personagem de exemplo
rep('<footer>Projeto Morada · proposta v1 · 2 nov 2026 · nomes, moeda e números de desempenho são metas a validar na fase 0.</footer>',
    '<footer>Projeto Morada · proposta v3 · 3 nov 2026 · nomes, moeda e números de desempenho são metas a validar na fase 0. Arte: pacotes da ITHappy Studios sob licença padrão; imagens desta página são testes com os pacotes grátis.</footer>')
rep('<text x="300" y="70">LOD0 · 2.340 tri</text><text x="300" y="88">25 ossos · 1 draw call</text>',
    '<text x="300" y="70">LOD0 · ~5.600 tri</text><text x="300" y="88">corpo adulto · 1 draw call</text>')
rep('<div style="font-size:11.5px;color:#565C82;margin-top:6px">Modo dev: Sofá Leve = 236 triângulos, 1 material.</div>',
    '<div style="font-size:11.5px;color:#565C82;margin-top:6px">Modo dev: Sofá Leve = 1.380 triângulos, 1 material.</div>')

open(ARQ, "w", encoding="utf-8").write(s)
print("ok", len(s))
