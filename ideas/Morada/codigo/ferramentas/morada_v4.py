"""Gera a v4 da proposta do Morada a partir da v3 (morada.html).

Base: revisão externa "Morada v4 — Proposta reformulada" (aceitando a premissa de que o jogador controla uma família e
o multijogador é por adição, e corrigindo o que ela erra ou já está desatualizado) e o trabalho de arte feito depois da
v3 (corpos, tons de pele, expressões e animações a partir dos pacotes grátis, Mixamo direto no nosso esqueleto).
"""
import sys

ARQ = sys.argv[1]
s = open(ARQ, encoding="utf-8").read()


def rep(a, b, n=1):
    global s
    assert s.count(a) >= 1, "não achei: " + a[:100]
    s = s.replace(a, b, n)


def secao(id_, novo):
    """Troca a <section id=...> inteira (até o </section> dela)."""
    global s
    i = s.index(f'<section id="{id_}"')
    j = s.index("</section>", i) + len("</section>")
    s = s[:i] + novo.strip() + s[j:]


# ------------------------------------------------------------------ navegação
rep('<a href="#visao">Visão</a><a href="#mercado">Mercado</a>',
    '<a href="#visao">Visão</a><a href="#mudancas">O que mudou</a><a href="#jogar">Como se joga</a><a href="#mercado">Mercado</a>')
rep('<a href="#mundo">Mundo compartilhado</a><a href="#npcs">NPCs e solo</a>',
    '<a href="#vida">Vida em família</a><a href="#mundo">Quem controla quem</a><a href="#npcs">Moradores e solo</a>')

# ------------------------------------------------------------------ hero
rep('<span class="eyebrow" style="--c:var(--tangerine)">Proposta de jogo · v3</span>',
    '<span class="eyebrow" style="--c:var(--tangerine)">Proposta de jogo · v4</span>')
rep('<p class="tagline">Um simulador de vida de verdade, com família viva e autônoma, para jogar com a família e os amigos no mesmo mundo, ao mesmo tempo, direto no navegador.</p>',
    '<p class="tagline">Um simulador de vida completo no navegador. Você controla uma família inteira; se quiser, convida amigos para dividir a mesma família ou morar no mesmo bairro, sem perder nada da simulação.</p>')
rep('<span class="tag" style="--soft:var(--tangerine-soft);--c:var(--tangerine)">Arte de estúdio licenciada</span>',
    '<span class="tag" style="--soft:var(--tangerine-soft);--c:var(--tangerine)">Arte dos pacotes grátis da ITHappy, adaptada</span>')
rep('<span class="tag" style="--soft:var(--leaf-soft);--c:var(--leaf)">Modo solo, até offline</span>',
    '<span class="tag" style="--soft:var(--leaf-soft);--c:var(--leaf)">Solo completo; multijogador por adição</span>')
rep('<div class="hero-meta"><span>Nome e moeda provisórios</span><span>3 nov 2026</span><span>v3: mercado, personagens, construção, família e negócio</span></div>',
    '<div class="hero-meta"><span>Nome e moeda provisórios</span><span>4 nov 2026</span><span>v4: o jogador controla uma família; quem controla quem; arte dos pacotes grátis</span></div>')

# ------------------------------------------------------------------ visão
rep('<h2>Cada pessoa controla o próprio personagem, num mundo que continua existindo quando ela sai</h2>',
    '<h2>Você controla uma família, não um avatar. Jogar com amigos acrescenta pessoas ao mesmo mundo</h2>')
rep('<p class="lead">Morada pega o gênero de simulação de vida e o torna social de verdade: amigos e parentes entram no mesmo servidor, namoram, casam e dividem uma casa, e cada um decide o que o seu personagem faz.</p>',
    '<p class="lead">Cada morador tem necessidades, personalidade, relacionamentos, rotina e ciclo de vida, haja um jogador ou vários. Sozinho, você comanda todos os moradores da sua casa. Com amigos, vocês dividem o controle da mesma família ou cuidam de famílias vizinhas. O multijogador muda as permissões, a sincronização e o tempo; não tira nenhum sistema da simulação.</p>')
rep('<h3>Juntos de verdade</h3>\n      <p class="small">Até 12 pessoas por mundo (meta). Romance, casamento e casa compartilhada entre jogadores reais, sempre com consentimento dos dois lados.</p>',
    '<h3>A família é o que se joga</h3>\n      <p class="small">Troque de morador pelo retrato; quem não recebe comando segue a própria rotina. Com amigos, até 12 pessoas por mundo (meta a medir), dividindo famílias e bairro, com consentimento nas decisões que mudam a vida de outra pessoa.</p>')
rep('<tr><td>Jogadores</td><td>Um jogador controla a família inteira</td><td><strong>Várias pessoas no mesmo mundo</strong>, cada uma com o seu personagem</td></tr>',
    '<tr><td>Jogadores</td><td>Um jogador controla a família inteira</td><td><strong>O mesmo</strong>, e mais pessoas podem dividir a família ou morar ao lado</td></tr>')
rep('<tr><td>Família</td><td>Família inteira controlável e autônoma</td><td><strong>O mesmo</strong>, e ainda com várias pessoas reais morando juntas</td></tr>',
    '<tr><td>Família</td><td>Família inteira controlável e autônoma</td><td><strong>O mesmo</strong>, com o controle dividido entre pessoas reais quando elas quiserem</td></tr>')
rep('<tr><td>Arte</td><td>Estilizada, dezenas de GB</td><td><strong>Cartoon low poly com uma paleta só</strong>: 300 personagens, 1.100 roupas e 1.000 móveis licenciados</td></tr>',
    '<tr><td>Arte</td><td>Estilizada, dezenas de GB</td><td><strong>Cartoon low poly com uma paleta só</strong>: pacotes grátis da ITHappy na primeira versão, pagos quando o jogo se pagar</td></tr>')

# ------------------------------------------------------------------ novas seções depois da visão
NOVAS = '''
<!-- O QUE MUDOU -->
<section id="mudancas">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--tangerine)">O que mudou da v3 para a v4</span>
    <h2>A revisão externa estava certa no essencial; corrigimos o que ela erra e o que já ficou para trás</h2>
    <p class="lead">A revisão "Morada v4 — Proposta reformulada" apontou que a v3 tratava o multijogador como outro jogo: cada pessoa com o próprio personagem e o controle da família como exceção do modo solo. Adotamos a premissa nova e o modelo de quem controla quem. Algumas partes da revisão precisavam de correção ou já estavam desatualizadas.</p>
  </div>
  <div class="grid g2">
    <div class="card facet" style="--soft:var(--leaf-soft)">
      <h3>Adotamos</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li><b>O jogador controla uma família.</b> Solo, família dividida e famílias vizinhas são três formas de entrar no mesmo mundo.</li>
        <li><b>Usuário, morador, família, moradia e lote são coisas separadas.</b> Controle é uma reserva temporária, não um dono fixo do personagem.</li>
        <li><b>Tempo:</b> ninguém acelera nem pausa um mundo com outras pessoas online sem o acordo delas (no começo, todos precisam concordar).</li>
        <li><b>Ausência protegida:</b> quem está fora segue uma rotina segura, sem nada irreversível; mudar de fase de vida fica para quando a pessoa voltar.</li>
        <li><b>Fundo da casa sem padrão de 70%:</b> quanto do salário vai para a casa é escolha de cada um.</li>
        <li><b>Construção conjunta com trava por região</b> e desfazer só das próprias operações.</li>
        <li><b>Metas de desempenho como hipóteses a medir</b>, com cenários de teste definidos.</li>
        <li><b>Ordem de trabalho:</b> provar o controle familiar e a vida (casar com NPC, ter filho, envelhecer) antes do multijogador social.</li>
      </ul>
    </div>
    <div class="card facet" style="--soft:var(--berry-soft)">
      <h3>Corrigimos na revisão</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li><b>Nomes:</b> a revisão chama os personagens de "Sims" e fala em "construir um The Sims", contrariando a própria regra de não usar a marca. Aqui são <b>moradores</b>, e o Morada tem identidade própria.</li>
        <li><b>Arte desatualizada:</b> ela parte dos pacotes pagos. A primeira versão usa os <b>pacotes grátis</b>, com 17 corpos, tons de pele, 10 expressões e animações já feitos (ver <a href="#arte">Arte</a>).</li>
        <li><b>Licença:</b> ela diz que a licença impede usar os arquivos como entrada de IA generativa e pede rever o pipeline. A licença que lemos permite ferramentas de IA de desenvolvimento, como o Claude Code, e proíbe treinar IA com os assets. Ela cita uma versão de 07/09/2026 que ainda não lemos, e os pacotes grátis seguem a política de uso gratuito. <b>Conferir o texto atual antes de seguir</b> (ver <a href="#riscos">Riscos</a>).</li>
        <li><b>Monorepo:</b> ela propõe seis pacotes novos. Mantemos o encaixe nas convenções do informach-apps: um app Next, um servidor de mundo e <code>@informach/morada-sim</code> como fonte TypeScript, sem etapa de build.</li>
        <li><b>Conta:</b> "usuário" no Morada é um <b>perfil do Recreio</b>. O titular aprova ações sensíveis, e perfis infantis têm restrições próprias, como nos outros apps da Informach.</li>
        <li><b>Rede:</b> a v3 já mandava rota com tick de início; a revisão lembra, com razão, que isso exige correção periódica de posição. Entrou na arquitetura.</li>
      </ul>
    </div>
  </div>
  <p class="caption">Já existia na v3 e a revisão manteve: mesma simulação no navegador e no servidor, morador NPC e morador de jogador com as mesmas regras, casa como documento, serviços contratados com agenda e assinatura sem moeda premium.</p>
</section>

<!-- COMO SE JOGA -->
<section id="jogar">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--sky)">Como se joga</span>
    <h2>Três maneiras de jogar, um jogo só</h2>
    <p class="lead">Não existe versão reduzida da simulação para o multijogador. O que muda é quem tem permissão de comandar, como os pedidos simultâneos se resolvem e como o tempo passa.</p>
  </div>
  <div class="grid g3">
    <div class="card facet" style="--soft:var(--leaf-soft)">
      <span class="tag" style="--soft:var(--leaf-soft);--c:var(--leaf)">Solo</span>
      <h3>A família inteira é sua</h3>
      <p class="small">Lia cria uma casa com Lia, Marcos e a filha Nina. Troca pelo retrato, manda Lia trabalhar, Marcos fazer o almoço e Nina estudar; quem não recebe comando cuida de si. Lia conhece um vizinho NPC, namora, casa, ele vem morar junto e passa a ser controlável. Pausa e acelera quando quiser.</p>
    </div>
    <div class="card facet" style="--soft:var(--sky-soft)">
      <span class="tag" style="--soft:var(--sky-soft);--c:var(--sky)">Família dividida</span>
      <h3>Dois amigos na mesma casa</h3>
      <p class="small">Lia convida Bruno para a família. Bruno assume Marcos; Lia segue com Lia. Nina pode ser dirigida por qualquer um dos dois, um de cada vez: se ambos tentarem, a tela mostra quem está dirigindo e permite pedir a troca. Se Bruno sai, Marcos não some: volta à autonomia, protegido.</p>
    </div>
    <div class="card facet" style="--soft:var(--berry-soft)">
      <span class="tag" style="--soft:var(--berry-soft);--c:var(--berry)">Famílias vizinhas</span>
      <h3>Cada um com a sua casa</h3>
      <p class="small">Bruno começa com a própria família em outro lote. Visitam-se, os moradores criam vínculos, namoram, casam, têm filhos e podem unir as casas. Unir ou separar muda quem mora onde e quem pode comandar; nunca a identidade, o parentesco ou a história de ninguém.</p>
    </div>
  </div>
  <h3>Convidar alguém pergunta como a pessoa vai participar</h3>
  <div class="tbl">
    <table>
      <thead><tr><th>Opção do convite</th><th>O que a pessoa pode fazer</th></tr></thead>
      <tbody>
        <tr><td><b>Dividir minha família</b></td><td>Comandar moradores autorizados que estiverem livres, ou criar um morador novo, conforme as regras do mundo</td></tr>
        <tr><td><b>Criar uma família vizinha</b></td><td>Começar a própria casa em outro lote do bairro</td></tr>
        <tr><td><b>Visitar</b></td><td>Circular e interagir, sem comandar moradores nem gastar ou construir</td></tr>
      </tbody>
    </table>
  </div>
  <p class="caption">Uma conta pode ter um morador preferido para entrar rápido, mas isso é preferência de interface, não regra do jogo.</p>
</section>
'''
rep('<!-- MERCADO -->', NOVAS + '\n<!-- MERCADO -->')

# ------------------------------------------------------------------ personagens: o que já está feito com os pacotes grátis
secao("personagens", '''
<section id="personagens">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--berry)">Personagens e criação</span>
    <h2>17 tipos de corpo, quatro tons de pele e dez expressões, já feitos a partir dos pacotes grátis</h2>
    <p class="lead">A primeira versão usa só os pacotes grátis da ITHappy. Todos os humanos deles têm o mesmo esqueleto de 44 ossos, então corpos, roupas, rostos e animações se combinam. Os corpos que o pacote não traz saem dos que ele traz, por script no Blender, sem modelar do zero. Os pacotes pagos entram quando o jogo se pagar, no mesmo esqueleto, sem refazer nada.</p>
  </div>
  <figure class="fig"><img src="img/corpos.webp" alt="Prancha com os tipos de corpo do Morada lado a lado, de adultos a bebês" loading="lazy" width="1600" height="1416"><figcaption>Os 17 corpos na mesma escala. Adulto, adulta e plus-size masculino vêm do pacote; os demais são derivados deles. Os bebês têm o mesmo corpo para meninos e meninas e mudam no rosto e no cabelo.</figcaption></figure>
  <div class="tbl">
    <table>
      <thead><tr><th>Fase de vida</th><th>Corpos</th><th>Como foi feito</th></tr></thead>
      <tbody>
        <tr><td><b>Bebê de colo</b></td><td>Menino e menina, com chupeta (azul ou rosa) do Creative Characters</td><td>Proporções por osso a partir do adulto; rosto mais redondo e olhos maiores</td></tr>
        <tr><td><b>Criança pequena (2–3 anos)</b></td><td>Menino e menina</td><td>Idem, com proporções de 2 a 3 anos</td></tr>
        <tr><td><b>Criança</b></td><td>Masculino e feminino</td><td>Escala por osso, cabeça proporcionalmente maior</td></tr>
        <tr><td><b>Adolescente</b></td><td>Masculino e feminino</td><td>Escala por osso, corpo mais fino</td></tr>
        <tr><td><b>Adulto</b></td><td>Adulto, adulta, plus-size masculino e feminino, musculoso, atlética, alto e magro</td><td>Três do pacote; plus-size feminina com a diferença medida entre o adulto e o plus-size do próprio pacote</td></tr>
        <tr><td><b>Idoso</b></td><td>Idoso e idosa</td><td>Escala por osso, postura levemente curvada, cabelo grisalho</td></tr>
      </tbody>
    </table>
  </div>
  <figure class="fig"><img src="img/expressoes.webp" alt="Grade com dez expressões em vários corpos, do adulto ao bebê" loading="lazy" width="1600" height="1360"><figcaption>Dez expressões em todos os corpos: neutro, feliz, triste, bravo, confiante, sério, surpreso, assustado, aborrecido e confuso. O pacote grátis só tem o rosto neutro; as outras nove reaproveitam as peças dele (sobrancelhas que giram, boca que curva, olhos que crescem), e só olhos fechados, olhos "&gt; &lt;" e boca aberta foram desenhados.</figcaption></figure>
  <div class="grid g3">
    <div class="card facet"><h4>Tom de pele livre</h4><p class="small">A pele usa uma faixa só da paleta; o tom é uma cor que a multiplica no jogo. Quatro tons de referência e qualquer outro. Nos tons escuros, olhos e sobrancelhas escurecem junto para manter o contraste.</p></div>
    <div class="card facet"><h4>Roupas e cabelos</h4><p class="small">Próxima etapa. Os pacotes grátis têm pouca roupa, sobretudo feminina. Peças de um corpo servem nos outros do mesmo tipo; adaptar cortes (manga, comprimento) e estampas é viável por script. Cabelos novos do zero ficam para os pacotes pagos.</p></div>
    <div class="card facet"><h4>Animações</h4><p class="small">Dez do pacote, idênticas às originais, e as do Mixamo. O caminho que funcionou melhor: enviar o corpo com o nosso esqueleto ao Mixamo e baixar as animações já nele, sem conversão. Ver <a href="#arte">Arte</a>.</p></div>
  </div>
  <p class="caption">Página de teste com os corpos, os tons, as expressões e as animações: <a href="https://claude.ai/artifact/Uw3fipkYR7aSq3dZFmZiMd">Tipos de corpo do Morada</a>.</p>
</section>
''')

# ------------------------------------------------------------------ vida em família (nova, depois de família e trabalho)
VIDA = '''
<!-- VIDA EM FAMÍLIA -->
<section id="vida">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--berry)">Vida em família</span>
    <h2>As regras da vida são as mesmas sozinho ou com amigos</h2>
    <p class="lead">Relacionamentos, gravidez, nascimento, envelhecimento, mudanças e separações são eventos da simulação, gravados no mundo. Jogar com outras pessoas só acrescenta consentimento quando a decisão muda a vida de um morador ligado a outra conta.</p>
  </div>
  <div class="grid g2">
    <div class="card facet">
      <h3>Relacionamentos e casamento</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li>Um grafo de vínculos persistente, independente de quem mora onde: amizade, atração, confiança, namoro, casamento, ex, parentesco.</li>
        <li><b>NPC com NPC</b> se relaciona sozinho, pela personalidade e pelas oportunidades. <b>Jogador com NPC:</b> o NPC aceita, recusa ou adia pela simulação.</li>
        <li><b>Dois moradores ligados a contas diferentes:</b> namoro, casamento, filhos e morar junto pedem o aceite das duas contas. Conversar, brincar e abraçar não pedem nada.</li>
        <li>Casar e morar junto são decisões separadas. Separar pode partir de um lado só.</li>
      </ul>
    </div>
    <div class="card facet">
      <h3>Gravidez e nascimento</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li>Mostrados de forma não explícita. Adoção e outras formas de formar família desde o início.</li>
        <li>A gravidez é um evento persistente, com data prevista, que avança no tempo do jogo, nunca com o save pausado.</li>
        <li>O bebê herda traços visuais dos pais com semente reproduzível, ganha identidade, parentesco e necessidades, e já nasce comandável pela família, por ações de cuidado.</li>
        <li>O nascimento não cria conta de jogador. Gêmeos e casos raros ficam para depois do caso simples.</li>
      </ul>
    </div>
    <div class="card facet">
      <h3>Fases de vida e fim da vida</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li>Seis fases: bebê de colo, criança pequena, criança, adolescente, adulto e idoso. Envelhecimento por mundo: desligado, lento, normal ou rápido.</li>
        <li>Mudar de fase mantém a mesma pessoa: memórias, família, habilidades e bens. A aparência é levada ao corpo da nova fase.</li>
        <li><b>Morte desligada por padrão</b> no público familiar. Se o mundo ligar, há evento de despedida, herança e memória; ninguém some sem explicação.</li>
      </ul>
    </div>
    <div class="card facet">
      <h3>Mudar, unir e separar casas</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li><b>Mudar:</b> escolher quem vai, o lote e o que leva do dinheiro, conferindo dependentes. Relações e carreira vão junto.</li>
        <li><b>Unir:</b> duas famílias viram uma casa; os acessos de quem controla são recalculados.</li>
        <li><b>Separar:</b> quem fica, quem sai, dependentes, lote e fundo. Com moradores de outras contas, cada passo pede aceite.</li>
        <li>Filhos com pais em casas diferentes mantêm o parentesco; guarda compartilhada fica para depois. Limite de moradores por casa: 8 no protótipo, a testar.</li>
      </ul>
    </div>
  </div>
  <p class="caption">O mundo guarda as memórias que importam (nascimento, adoção, casamento, mudança, formatura, promoção) e as notícias do bairro saem delas, não de sorteio.</p>
</section>
'''
rep('<!-- MUNDO COMPARTILHADO -->', VIDA + '\n<!-- MUNDO COMPARTILHADO -->')

# ------------------------------------------------------------------ quem controla quem (substitui o antigo "mundo compartilhado")
i = s.index('<section id="mundo"')
j = s.index('<h3>Presença: o que acontece com quem sai</h3>', i)
s = s[:i] + '''<section id="mundo">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--berry)">Quem controla quem</span>
    <h2>Morador, família, moradia e jogador não são a mesma coisa</h2>
    <p class="lead">O morador existe sozinho, com ou sem alguém conectado. A família é o grupo que mora junto e administra recursos. O jogador recebe permissão de comandar uma família, e o controle de um morador é uma reserva curta, não um dono.</p>
  </div>
  <div class="tbl">
    <table>
      <thead><tr><th>Conceito</th><th>O que é</th><th>Exemplo</th></tr></thead>
      <tbody>
        <tr><td><b>Jogador</b></td><td>Um perfil do Recreio (titular ou perfil da família)</td><td>Perfil da Lia</td></tr>
        <tr><td><b>Mundo</b></td><td>Um save independente, com relógio, bairros, moradores e regras</td><td>Mundo dos amigos</td></tr>
        <tr><td><b>Lote e imóvel</b></td><td>Área do bairro e a construção nela, como documento</td><td>Lote 14, casa 14</td></tr>
        <tr><td><b>Família (núcleo doméstico)</b></td><td>Quem mora junto e divide fundo e casa</td><td>Família Oliveira</td></tr>
        <tr><td><b>Morador</b></td><td>Pessoa virtual com identidade e simulação próprias</td><td>Lia, Marcos, Nina</td></tr>
        <tr><td><b>Relação</b></td><td>Vínculo entre moradores, morem juntos ou não</td><td>Pais, cônjuges, ex, amigos</td></tr>
        <tr><td><b>Acesso à família</b></td><td>Direito de um jogador comandar uma família, com permissões</td><td>Lia e Bruno na família 14</td></tr>
        <tr><td><b>Controle temporário</b></td><td>Reserva de um morador para receber comandos de um jogador, renovada enquanto ele joga</td><td>Bruno dirige Marcos agora</td></tr>
        <tr><td><b>Morador preferido</b></td><td>Ligação de um morador a uma conta, para preferências e proteção quando ela está fora</td><td>Marcos é o preferido do Bruno</td></tr>
        <tr><td><b>Presença</b></td><td>Se o jogador está conectado naquele mundo</td><td>Bruno desconectado</td></tr>
      </tbody>
    </table>
  </div>
  <div class="grid g2">
    <div class="card facet">
      <h3>Regras que não se quebram</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li>Um morador mora em no máximo uma família por vez; parentesco não depende de morar junto.</li>
        <li>Um morador tem no máximo um jogador dirigindo por vez; sem ninguém, segue a autonomia.</li>
        <li>Morador preferido de outra conta só recebe ações sensíveis com autorização dela.</li>
        <li>Ser mãe, pai ou filho no jogo não dá poder de comandar, vender ou editar: isso é permissão da família.</li>
        <li>Visitar um lote não dá poder de construir, gastar ou comandar.</li>
        <li>Toda mudança permanente grava autor, mundo, versão e motivo.</li>
      </ul>
    </div>
    <div class="card facet">
      <h3>Pedidos ao mesmo tempo</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li>Duas pessoas querem o mesmo morador: vale a primeira reserva; a outra vê quem está dirigindo e pode pedir a troca.</li>
        <li>A reserva expira sozinha depois de uma desconexão, com uma janela para reconectar.</li>
        <li>O mesmo objeto: o ponto de uso é reservado pela simulação, com fila ou alternativa.</li>
        <li>Construção: trava da região ou da peça em edição, com versão; desfazer reverte só as próprias operações ainda válidas.</li>
        <li>Dinheiro e bens: operações transacionais, com identificador único, sem duplicar nem deixar o fundo negativo.</li>
      </ul>
    </div>
  </div>
  <h3>Permissões por jogador, em cada família</h3>
  <div class="chips">
    <span class="tag" style="--soft:var(--sky-soft);--c:var(--sky)">Ver</span>
    <span class="tag" style="--soft:var(--sky-soft);--c:var(--sky)">Comandar moradores sem preferido</span>
    <span class="tag" style="--soft:var(--sky-soft);--c:var(--sky)">Comandar preferido de outro, com aceite</span>
    <span class="tag" style="--soft:var(--teal-soft);--c:var(--teal)">Editar aparência</span>
    <span class="tag" style="--soft:var(--teal-soft);--c:var(--teal)">Construir</span>
    <span class="tag" style="--soft:var(--teal-soft);--c:var(--teal)">Decorar</span>
    <span class="tag" style="--soft:var(--sun-soft);--c:var(--sun)">Gastar até um limite</span>
    <span class="tag" style="--soft:var(--sun-soft);--c:var(--sun)">Gerir finanças</span>
    <span class="tag" style="--soft:var(--berry-soft);--c:var(--berry)">Convidar moradores</span>
    <span class="tag" style="--soft:var(--berry-soft);--c:var(--berry)">Autorizar mudança</span>
    <span class="tag" style="--soft:var(--leaf-soft);--c:var(--leaf)">Gerir serviços</span>
    <span class="tag" style="--soft:var(--leaf-soft);--c:var(--leaf)">Gerir o mundo</span>
  </div>

  <h3>Relógio do mundo</h3>
  <div class="grid g2">
    <div class="card facet" style="--cut:18px">
      <h3>Um relógio por mundo</h3>
      <p class="small">No solo, pausa e 1×, 2× e 3× à vontade. Com outras pessoas online, só existe um relógio, no servidor: acelerar, pausar ou pular a noite exige o acordo de todos os conectados (no começo, unanimidade), e nunca durante parto, trabalho ativo ou evento importante. Abrir menu, inventário ou perfil não pausa o mundo dos outros. Quando o último sai, o mundo salva, pausa e sai da memória.</p>
    </div>
    <div class="timew" aria-labelledby="tw-t">
      <h4 id="tw-t">Simule a velocidade do mundo</h4>
      <div class="seg" role="group" aria-label="Duração de um dia de jogo">
        <button type="button" id="tw-24" data-min="24" aria-pressed="false">1 dia = 24 min</button>
        <button type="button" id="tw-48" data-min="48" aria-pressed="true">48 min</button>
        <button type="button" id="tw-72" data-min="72" aria-pressed="false">72 min</button>
        <button type="button" id="tw-96" data-min="96" aria-pressed="false">96 min</button>
      </div>
      <div class="tw-out" id="tw-out"></div>
    </div>
  </div>

''' + s[j:]
rep('<div class="state" style="--c:var(--leaf)"><h4><i class="dot"></i>Online</h4><p class="small">A pessoa controla o personagem. A autonomia só age quando a fila está vazia e pode ser desligada.</p></div>',
    '<div class="state" style="--c:var(--leaf)"><h4><i class="dot"></i>Online</h4><p class="small">A pessoa dirige o morador que reservou. A autonomia age quando a fila fica vazia e pode ser desligada.</p></div>')
rep('<div class="state" style="--c:var(--sun)"><h4><i class="dot"></i>Ausente</h4><p class="small">Saiu, mas outros seguem jogando. O personagem cuida das necessidades em casa (comer, dormir, banho), não inicia romance e não gasta dinheiro.</p></div>',
    '<div class="state" style="--c:var(--sun)"><h4><i class="dot"></i>Ausente</h4><p class="small">Saiu, mas outros seguem jogando. O morador preferido dela segue uma rotina protegida: cuida de si, sem romance, gravidez, mudança, venda ou gasto grande. Mudar de fase de vida espera a volta.</p></div>')
rep('<div class="state" style="--c:var(--muted)"><h4><i class="dot"></i>Mundo pausado</h4><p class="small">Ninguém online: relógio, necessidades e contratos param. Ninguém perde a vida do personagem enquanto todos dormem na vida real.</p></div>',
    '<div class="state" style="--c:var(--muted)"><h4><i class="dot"></i>Mundo pausado</h4><p class="small">Ninguém online: relógio, necessidades e contratos param. Ao voltar, um resumo mostra o que mudou no mundo enquanto a pessoa estava fora.</p></div>')
rep('<h3>Relacionamentos entre jogadores</h3>\n  <p class="prose small">Toda ação que muda o vínculo entre dois personagens de jogadores vira um convite.',
    '<h3>Relacionamentos entre moradores de contas diferentes</h3>\n  <p class="prose small">Toda ação que muda o vínculo entre moradores preferidos de contas diferentes vira um convite.')
rep('<li><b>Fundo da casa</b> para contas, compras e salários de funcionários, e <b>carteira pessoal</b> de cada jogador. Cada um decide quanto do próprio salário vai para o fundo (padrão 70%).</li>',
    '<li><b>Fundo da casa</b> para contas, compras e salários de funcionários, e <b>carteira pessoal</b> de cada morador. Quanto do salário vai para o fundo é escolha de cada um, sem padrão imposto.</li>')
rep('<li><b>Permissões por morador:</b> construir, comprar acima de um limite, gerenciar contratos, convidar visitas. Quem é dono do lote define.</li>',
    '<li><b>Permissões por jogador:</b> construir, gastar acima de um limite, gerir contratos, convidar moradores. Quem gere a família define, e pode revogar.</li>')
rep('<li><b>Filhos e NPCs da casa</b> podem ser dirigidos por qualquer adulto com permissão, um de cada vez (trava de controle visível para todos); sem ninguém dirigindo, seguem a autonomia.</li>',
    '<li><b>Filhos e moradores sem preferido</b> podem ser dirigidos por qualquer jogador com permissão, um de cada vez (reserva visível para todos); sem ninguém dirigindo, seguem a autonomia.</li>')
rep('<li><b>Construção sem conflito:</b> quem edita um cômodo trava aquele cômodo para os outros até sair do modo construção. Toda edição entra num histórico com desfazer.</li>',
    '<li><b>Construção sem conflito:</b> quem edita trava a região ou a peça, não o cômodo inteiro (o cômodo pode mudar com a obra). Cada um desfaz só as próprias operações.</li>')
rep('<li>Conteúdo romântico liga ou desliga por jogador; contas de crianças vêm com ele desligado e o anfitrião não consegue ligar por elas.</li>',
    '<li>Conteúdo romântico liga ou desliga por jogador; perfis infantis vêm com ele desligado e o anfitrião não consegue ligar por eles. A idade do perfil e a idade do morador são coisas diferentes.</li>')
rep('<li>Chat com filtro configurável e registro acessível ao anfitrião.</li>',
    '<li>Chat com filtro configurável e denúncia. O anfitrião não lê o histórico privado de ninguém; retenção e moderação seguem a política de privacidade.</li>')

# ------------------------------------------------------------------ moradores e solo
rep('<span class="eyebrow" style="--c:var(--leaf)">NPCs e modo solo</span>\n    <h2>Jogador ou NPC, todo personagem é igual: só muda quem está dirigindo</h2>',
    '<span class="eyebrow" style="--c:var(--leaf)">Moradores e modo solo</span>\n    <h2>Todo morador é igual: só muda quem está dirigindo agora</h2>')
rep('Um único campo diz quem dirige agora: uma pessoa ou a IA. Trazer um NPC para morar em casa e passar a controlá-lo é só trocar esse campo, e o modo solo é o mesmo jogo com uma pessoa só.</p>',
    '"NPC" não é um tipo de personagem: é só um morador que ninguém está dirigindo agora, ou que nunca foi preferido de uma conta. Quem dirige é uma reserva de sessão, não um campo gravado no morador. Trazer alguém para morar em casa muda a família dele e, com isso, quem pode comandá-lo.</p>')
rep('''        <tr><td><b>O seu</b></td><td>Só você</td><td>Quando sua fila está vazia, ou no modo ausente quando você sai</td></tr>
        <tr><td><b>De outro jogador</b></td><td>Só o dono, nunca outra pessoa</td><td>Modo ausente: cuida de si, sem romance e sem gastar</td></tr>
        <tr><td><b>NPC da sua casa</b> (filhos, cônjuge NPC, quem veio morar)</td><td>Qualquer adulto da casa com permissão, um de cada vez</td><td>Sempre que ninguém está dirigindo</td></tr>''',
    '''        <tr><td><b>Morador da sua família sem preferido</b> (filhos, cônjuge que veio morar)</td><td>Qualquer jogador com acesso à família, um de cada vez</td><td>Sempre que ninguém está dirigindo</td></tr>
        <tr><td><b>Seu morador preferido</b></td><td>Você; outros só se você liberar</td><td>Quando sua fila está vazia, ou na rotina protegida quando você sai</td></tr>
        <tr><td><b>Preferido de outra conta, fora do ar</b></td><td>Ninguém, salvo autorização dada antes</td><td>Rotina protegida: cuida de si, nada irreversível</td></tr>''')
rep('<td><b>Quem você controla</b></td><td>A família inteira, trocando pelo retrato</td><td>Seu personagem e os NPCs da casa com permissão</td>',
    '<td><b>Quem você controla</b></td><td>A família inteira, trocando pelo retrato</td><td>Os moradores das famílias a que você tem acesso, um de cada vez, pelo retrato</td>')
rep('<td><b>Romance</b></td><td>Os NPCs decidem pela relação</td><td>Entre jogadores, com convite e aceite</td>',
    '<td><b>Romance</b></td><td>Os moradores decidem pela relação</td><td>O mesmo; entre preferidos de contas diferentes, com convite e aceite</td>')
rep('<div class="card facet"><h4>Do solo para o grupo</h4><p class="small">Um save solo pode virar mundo compartilhado: sobe para o servidor e você convida a família. Seus NPCs da casa continuam seus; os convidados criam personagens novos ou assumem um morador que você liberar.</p></div>',
    '<div class="card facet"><h4>Do solo para o grupo</h4><p class="small">Publicar um save solo cria uma <b>cópia</b> no servidor, com outro identificador; o save local fica intacto e os dois seguem como ramos separados. Ninguém vira avatar obrigatório: você vira anfitrião com acesso às suas famílias e convida dividindo a família, como vizinho ou visitante.</p></div>')
rep('<div class="card facet"><h4>Sozinho num mundo do grupo</h4><p class="small">O anfitrião pode liberar acelerar o tempo para quem estiver sozinho online. Uma regra do mundo decide o que acontece com os personagens de quem está fora: <b>congelam</b> (não envelhecem nem perdem nada) ou <b>seguem a vida</b> no modo ausente. Proposta: congelar por padrão.</p></div>',
    '<div class="card facet"><h4>Do grupo para o solo</h4><p class="small">Exportar uma cópia do mundo para jogar sozinho, com consentimento quando há moradores criados por outras pessoas. A cópia nunca afeta o mundo do grupo, e não prometemos sincronizar os dois de volta: unir históricos divergentes de famílias e bens é arriscado demais.</p></div>')
rep('<div class="card facet"><h4>Quem sai do grupo de vez</h4><p class="small">O personagem pode virar NPC e continuar no bairro, com a família e os relacionamentos que construiu, em vez de sumir do mundo.</p></div>',
    '<div class="card facet"><h4>Quem sai do grupo de vez</h4><p class="small">O morador preferido dela deixa de ter preferido e segue no bairro, com a família, a carreira e os relacionamentos que construiu, em vez de sumir do mundo.</p></div>')
rep('Filhos de qualquer casal da casa (jogador com jogador, ou jogador com NPC) nascem como NPCs da casa.</p>',
    'Filhos de qualquer casal da casa nascem como moradores sem preferido, comandáveis por quem tem acesso à família.</p>')

# ------------------------------------------------------------------ telas: convite e anfitrião
rep('<div class="gp gdark" style="left:20px;bottom:20px;font-size:12.5px;width:300px">Ações que mudam o vínculo entre jogadores sempre pedem confirmação. Enquanto isso, os dois ficam conversando.</div>',
    '<div class="gp gdark" style="left:20px;bottom:20px;font-size:12.5px;width:300px">Ações que mudam o vínculo entre preferidos de contas diferentes pedem confirmação. Enquanto isso, os dois ficam conversando.</div>')
rep('<div class="row"><span>Quem estiver sozinho online pode acelerar</span><i class="tog on"></i></div>\n        <div class="row"><span>Personagens de quem está fora</span><b>Congelam</b></div>',
    '<div class="row"><span>Acelerar ou pausar com outros online</span><b>Todos concordam</b></div>\n        <div class="row"><span>Moradores de quem está fora</span><b>Rotina protegida</b></div>\n        <div class="row"><span>Mudar de fase com a conta fora</span><b>Espera a volta</b></div>')
rep('<tr><td>Téo (12 anos)</td><td>conta infantil</td><td style="text-align:right">trabalhando</td></tr>',
    '<tr><td>Téo (12 anos)</td><td>perfil infantil</td><td style="text-align:right">fora do ar</td></tr>')
rep('<span class="gbtn pri">Pausar mundo</span>', '<span class="gbtn pri">Pedir pausa</span>')
rep('<li>Conta infantil não liga conteúdo romântico, nem pelo anfitrião.</li>',
    '<li>Perfil infantil não liga conteúdo romântico, nem pelo anfitrião.</li>\n        <li>Pausar ou acelerar com outras pessoas online abre uma votação; ninguém para o relógio dos outros sozinho.</li>')

# ------------------------------------------------------------------ técnica: controle como sessão e comandos com versão
TEC = '''
  <h3>Controle é sessão; o morador é permanente</h3>
  <div class="grid g2">
    <div style="display:grid;gap:22px;min-width:0">
      <div class="code-head"><span>packages/morada-sim/dominio/tipos.ts</span><span>esboço</span></div>
<pre><span class="k">interface</span> Morador {
  id: MoradorId; mundoId: MundoId;
  familiaId: FamiliaId | <span class="k">null</span>;
  fase: <span class="s">"colo"</span> | <span class="s">"pequeno"</span> | <span class="s">"crianca"</span> | <span class="s">"adolescente"</span> | <span class="s">"adulto"</span> | <span class="s">"idoso"</span>;
  necessidades: Record&lt;string, number&gt;;
  preferidoDe?: PerfilId;      <span class="c">// preferência e proteção, não dono</span>
}
<span class="k">interface</span> AcessoFamilia { familiaId; perfilId; permissoes: Permissao[] }
<span class="k">interface</span> ControleTemporario {      <span class="c">// nunca gravado no morador</span>
  moradorId; perfilId; sessaoId; expiraEm: number;
}
<span class="k">interface</span> Intencao {
  comandoId: string;           <span class="c">// idempotência</span>
  moradorId; acao; versaoEsperada: number;
}</pre>
    </div>
    <div class="card facet" style="--cut:18px">
      <h3>Como um comando anda</h3>
      <ol class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li>O cliente escolhe um morador e pede a reserva.</li>
        <li>Servidor (ou o processo do solo) confere acesso e presença.</li>
        <li>O cliente manda a intenção com identificador e versão esperada.</li>
        <li>A simulação valida, decide e registra o evento no tick do mundo.</li>
        <li>Dinheiro, nascimento, vínculo e permissões só mudam no servidor, em transação.</li>
        <li>Todos recebem as mudanças e os eventos de apresentação; o navegador anima.</li>
      </ol>
      <p class="small">Uma animação que falha no navegador nunca paga salário em dobro nem perde o bebê do colo: a simulação registra o que acontece e a animação só mostra.</p>
    </div>
  </div>
  <div class="grid g3">
    <div class="card facet"><h4>Rede</h4><p class="small">WebSocket próprio no servidor de mundo; Colyseus é uma opção a avaliar (salas, patches, reconexão), sem amarrar a simulação a ele. A unidade de relógio e de autoridade é o mundo; o interesse é filtrado por lote.</p></div>
    <div class="card facet"><h4>Movimento</h4><p class="small">Rota e tick de início, como na v3, mais correção periódica de posição: rota bloqueada, colisão e atraso acontecem. Rota dos moradores sem jogador calculada no servidor.</p></div>
    <div class="card facet"><h4>Solo e offline</h4><p class="small">O mesmo pacote de regras roda num Worker com save em IndexedDB. O navegador pode limpar dados e abas em segundo plano desaceleram: save local não é backup, exportar é obrigatório, e o relógio solo pausa ao fechar.</p></div>
  </div>
'''
i = s.index('<section id="tecnica"')
j = s.index('</section>', i)
s = s[:j] + TEC + s[j:]

# ------------------------------------------------------------------ arte: o que de fato temos
secao("arte", '''
<section id="arte">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--tangerine)">Arte</span>
    <h2>Pacotes grátis na primeira versão, adaptados por script; animações do Mixamo direto no nosso esqueleto</h2>
    <p class="lead">Testamos arte do zero por script e com IA geradora de modelos: não chegou na qualidade. A primeira versão usa os pacotes grátis da ITHappy, que já cobrem os corpos, o rosto e parte da casa e da cidade. Os pacotes pagos (City Characters, Cute Furniture, Cartoon City, cerca de R$ 1.000) entram quando o jogo se pagar, no mesmo esqueleto e na mesma paleta.</p>
  </div>
  <div class="tbl">
    <table>
      <thead><tr><th>Pacote grátis</th><th>Usamos para</th><th>Fica de fora</th></tr></thead>
      <tbody>
        <tr><td><b>Creative Characters, Casino, Chess, Apocalypse, Christmas</b></td><td>Corpos, rosto, cabelos, chupeta, 10 animações; Natal guardado para evento sazonal</td><td>Armas, jogos de azar, roupa de showgirl, animações de luta e morte</td></tr>
        <tr><td><b>Cute Furniture, Christmas, Chess, Casino</b></td><td>Cerca de 150 objetos da casa: camas, banheiro, cozinha, sala, escritório</td><td>Paredes e telhado de biscoito do Natal</td></tr>
        <tr><td><b>Claw Machine</b></td><td>16 bichinhos de pelúcia para o quarto das crianças</td><td>A máquina de pegar prêmio</td></tr>
        <tr><td><b>Cartoon City</b></td><td>Ruas, calçadas, semáforos, carros, ponto de ônibus</td><td>Prédios sem interior (só fachada)</td></tr>
        <tr><td><b>Animals, Fantasy, Weapons</b></td><td>Nada</td><td>Estilo diferente e textura com marca d'água</td></tr>
      </tbody>
    </table>
  </div>
  <div class="grid g2">
    <figure class="fig"><img src="img/mixamo_direto.webp" alt="Doze quadros de animações do Mixamo no adulto do Morada, com cadeira, cama, escada, corda, caixa, par, painel, barra e saco" loading="lazy" width="1068" height="690"><figcaption>Animações baixadas do Mixamo com o nosso esqueleto, sem conversão, e os auxiliares da cena de teste (cadeira, cama, escada, corda, barra, saco, caixa e par).</figcaption></figure>
    <div class="card facet" style="--cut:18px">
      <h3>O que aprendemos com as animações</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li><b>Converter do Mixamo por conta própria</b> deixa braços entrando no corpo e mãos fora do lugar, porque o repouso do Mixamo é em "T" e o do pacote em "A". Corrigimos com alinhamento e IK, mas o resultado ficou abaixo do esperado.</li>
        <li><b>Mandar o nosso corpo, com o nosso esqueleto, ao Mixamo</b> funcionou: ele aceita os 44 ossos e devolve as animações já neles, com repouso idêntico (0° de diferença). Também permite afastar os braços com o ajuste Arm-Space.</li>
        <li><b>Basta um corpo por grupo</b>, porque todos têm o mesmo esqueleto: adulto (serve para adulta, adolescentes, idosos, atlética e alto e magro), plus-size (com musculoso), criança (com 2–3 anos) e bebê.</li>
        <li><b>As animações do pacote ficam como vieram.</b> A única exceção é "Ao telefone" em crianças e bebês, com a mão afastada do rosto.</li>
      </ul>
    </div>
  </div>
  <div class="pipe" style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <div class="step">1 · Pacotes grátis<small>FBX e paleta</small></div>
    <div class="step">2 · Blender por script<small>corpos, tons, expressões, chupeta</small></div>
    <div class="step">3 · Mixamo<small>um corpo por grupo, com o nosso esqueleto</small></div>
    <div class="step">4 · Auxiliares de teste<small>cadeira, cama, escada, par</small></div>
    <div class="step">5 · Biblioteca de animações<small>uma por grupo, não por corpo</small></div>
    <div class="step">6 · GLB otimizado<small>meshopt, KTX2, manifesto</small></div>
  </div>
  <div class="grid g3">
    <div class="card facet"><h4>Próximo: roupas e cabelos</h4><p class="small">Trocar peças entre corpos do mesmo tipo, adaptar cortes e estampas, recolorir pela paleta. Matriz de testes peça × corpo × fase para não atravessar a malha.</p></div>
    <div class="card facet"><h4>Próximo: animações em par</h4><p class="small">Colo, abraço, beijo e aperto de mão precisam de pontos de alinhamento, sincronismo e trava das duas pessoas, não duas animações soltas. O teste do "Beijo" com par mostrou a distância certa entre as duas.</p></div>
    <div class="card facet"><h4>Próximo: bebês na prática</h4><p class="small">Proporções aprovadas; faltam colo, berço, carrinho e engatinhar, com contato correto com o adulto e os móveis.</p></div>
  </div>
  <p class="caption">Os arquivos originais nunca vão para o jogo, só GLBs empacotados, sem opção de exportar. Subir um corpo para o Mixamo da própria conta é uso privado para gerar animações; não compartilhar esses personagens com outras pessoas.</p>
</section>
''')

# ------------------------------------------------------------------ desempenho
rep('<h2>Orçamento fixo por quadro, conferido no CI</h2>', '<h2>Metas a provar em teste, não promessas</h2>')
i = s.index('<section id="desempenho"')
j = s.index('</section>', i)
s = s[:j] + '''
  <div class="grid g2">
    <div class="card facet">
      <h3>Cenários de teste</h3>
      <ol class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        <li>Casa pequena: 1 jogador, 4 moradores, 100 móveis, 6 necessidades.</li>
        <li>Casa grande: 8 moradores, mais de 300 itens, 2 funcionários, 2 andares.</li>
        <li>Família dividida: 2 clientes editando e interagindo na mesma casa.</li>
        <li>Bairro: 12 jogadores em várias famílias, moradores sem jogador em simulação resumida.</li>
        <li>Vida longa: 100 dias de jogo com nascimentos, envelhecimento e mudanças, sem vazar memória.</li>
        <li>Queda de rede durante nascimento, compra, mudança e construção.</li>
      </ol>
      <p class="small">Medir tempo de quadro (p50 e p95), carregamento, memória, draw calls, tráfego, CPU do servidor e tempo de navmesh. Os limites oficiais só saem depois.</p>
    </div>
    <div class="card facet">
      <h3>O que os corpos já mostraram</h3>
      <p class="small">Hoje cada corpo de teste carrega de 4 a 9 MB porque leva todas as animações junto. Como os 17 compartilham o esqueleto, as animações devem virar uma biblioteca única por grupo de corpo, baixada uma vez e reaproveitada; o corpo, o rosto e as expressões ficam por volta de 0,3 MB. É isso que torna possível começar a jogar com cerca de 35 MB.</p>
    </div>
  </div>
''' + s[j:]

# ------------------------------------------------------------------ fases
secao("fases", '''
<section id="fases">
  <div class="sec-head">
    <span class="eyebrow" style="--c:var(--sky)">Fases</span>
    <h2>Oito fases, cada uma jogável no fim; a família funciona antes do multijogador</h2>
    <p class="lead">O multijogador está previsto no modelo desde a fase 0, mas só vira experiência quando a casa e a família já são boas sozinhas. Casar com um NPC e controlar o filho vem antes de qualquer recurso social.</p>
  </div>
  <div class="tbl">
    <table>
      <thead><tr><th>Fase</th><th>O que dá para jogar</th><th>Pronto quando</th></tr></thead>
      <tbody>
        <tr><td><b>0 · Modelo e base</b></td><td>Mundo, família, morador, perfil, acesso, reserva de controle, relógio e comandos; uma cena com 2 clientes. Arte: corpos, tons e expressões (feito), animações por grupo no Mixamo (em andamento)</td><td>A mesma simulação roda no Worker e no servidor; nada no modelo diz "um perfil = um morador"</td></tr>
        <tr><td><b>1 · Casa solo jogável</b></td><td>Criar de 1 a 4 moradores, retratos, necessidades, 20 a 30 interações, paredes e móveis, salvar e pausar</td><td>Uma pessoa administra todos os moradores de uma casa por 7 dias de jogo</td></tr>
        <tr><td><b>2 · Família completa mínima</b></td><td>Relações, namoro com NPC, morar junto, gravidez ou adoção, nascimento, bebê, envelhecimento, mudança simples</td><td>Um casal tem um filho, o filho é comandável e cresce sem perder identidade</td></tr>
        <tr><td><b>3 · Família dividida</b></td><td>Convite, dois jogadores, reserva de qualquer morador autorizado, reconexão, relógio comum</td><td>Duas pessoas comandam a mesma família; o filho nunca tem dois controladores</td></tr>
        <tr><td><b>4 · Famílias vizinhas</b></td><td>Famílias separadas, visitas, casamento, unir e separar casas, mudar de lote</td><td>Dois jogadores casam e formam uma família sem perder morador, carreira nem relações</td></tr>
        <tr><td><b>5 · Profundidade da vida</b></td><td>Escola, empregos, habilidades, contas, serviços contratados, agenda, histórias de vizinhos</td><td>Semanas de jogo coerentes com trabalho e funcionários ao mesmo tempo</td></tr>
        <tr><td><b>6 · Conteúdo e acabamento</b></td><td>Catálogo maior (pacotes pagos quando houver receita), casas prontas, acessibilidade, otimização, segurança</td><td>Beta privado no hardware-alvo e no cenário de 12 jogadores</td></tr>
        <tr><td><b>7 · Lançamento no Recreio</b></td><td>Assinatura, contas, primeiros passos, backups, operação, suporte, moderação</td><td>Uma família de fora assina, joga e convida um amigo sem ajuda do time</td></tr>
      </tbody>
    </table>
  </div>
  <h3>Testes de aceitação que não podem falhar</h3>
  <div class="grid g2">
    <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
      <li>Solo: criar 3 moradores e trocar entre todos; os outros agem sozinhos.</li>
      <li>Solo: um NPC casa, vem morar e passa a ser comandável.</li>
      <li>Solo: nasce um bebê que mantém o parentesco e vira criança sendo a mesma pessoa.</li>
      <li>Família dividida: dois jogadores comandam dois moradores ao mesmo tempo.</li>
      <li>Família dividida: os dois tentam o filho; só um consegue a reserva por vez.</li>
      <li>Família dividida: uma saída inesperada não apaga o morador nem corrompe a fila.</li>
      <li>Romance e filhos entre preferidos de contas diferentes não acontecem sem o aceite das duas.</li>
      <li>Vizinhos: casas separadas visitam, casam e formam uma família nova.</li>
    </ul>
    <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
      <li>Mudar de casa mantém carreira, inventário, parentesco e história.</li>
      <li>Ninguém acelera um mundo ocupado por outras pessoas sem o acordo delas.</li>
      <li>O save solo sobrevive a reiniciar o navegador e pode ser exportado.</li>
      <li>Publicar o solo cria uma cópia online sem tocar no save de origem.</li>
      <li>Compras ao mesmo tempo não deixam o fundo negativo nem duplicam objetos.</li>
      <li>Dois moradores não ocupam o mesmo ponto de uso de um móvel.</li>
      <li>Sem permissão, ninguém age sobre morador ou lote trocando identificadores na rede.</li>
      <li>Restaurar backup é testado, não só escrito.</li>
    </ul>
  </div>
</section>
''')

# ------------------------------------------------------------------ riscos
rep('<tr><td>Uso dos assets fora do que a licença permite</td>',
    '<tr><td>Leitura da licença dos pacotes (grátis e pagos)</td><td>Alto</td><td>A revisão externa cita uma versão de 07/09/2026 que restringiria usar os arquivos como entrada de IA generativa; a que lemos permite ferramentas de IA de desenvolvimento e proíbe treinar IA. Ler o texto atual da política gratuita e da licença paga antes de seguir; pedir autorização por escrito à ITHappy se houver dúvida.</td></tr>\n        <tr><td>Acesso confuso ao controle de moradores</td><td>Crítico</td><td>Modelo família + reserva de controle e testes de concorrência desde a fase 0.</td></tr>\n        <tr><td>Acelerar o tempo prejudica quem está fora</td><td>Crítico</td><td>Acordo de todos os conectados e proteção das ações irreversíveis.</td></tr>\n        <tr><td>Save solo divergindo do mundo online</td><td>Alto</td><td>Publicar como cópia, versões e migração; nada de sincronização automática nos dois sentidos.</td></tr>\n        <tr><td>Uso dos assets fora do que a licença permite</td>')
rep('<li>O que acontece com os personagens de quem está fora quando alguém acelera sozinho: congelar ou seguir a vida (proposta: congelar).</li>',
    '<li>Regra de acordo para o tempo depois do MVP: unanimidade ou maioria com prazo.</li>\n      <li>Se o envelhecimento de moradores preferidos de quem está fora fica sempre adiado ou vira opção do mundo.</li>\n      <li>Quando comprar os pacotes pagos e em que ordem (proposta: personagens primeiro).</li>')
rep('<li>Gravidez e adoção, ou só adoção no lançamento.</li>',
    '<li>Gravidez e adoção, ou só adoção no lançamento; morte desligada por padrão (proposta: sim).</li>')

# ------------------------------------------------------------------ rodapé
rep('v3', 'v4', 1) if False else None
open(ARQ, "w", encoding="utf-8").write(s)
print("ok", len(s))
