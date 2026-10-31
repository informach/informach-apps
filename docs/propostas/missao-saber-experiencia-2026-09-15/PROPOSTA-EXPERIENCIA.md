# Missão Saber — estudo de dois cases infantis e proposta de experiência

Data: 15/09/2026. Escopo: estudo de duas referências públicas de produto infantil e proposta de melhorias de funcionalidade e design para `apps/missao-saber`, preservando a essência pedagógica e legal já decidida em [PROPOSTA.md](../missao-saber-2026-09-13/PROPOSTA.md) e no [plano comercial](../missao-saber-2026-09-13/PLANO-VERSAO-COMERCIAL.md).

Referências estudadas (Behance, acesso em 15/09/2026):

- **RIMI — Gamified Learning App for Kids** (Mariam Faris, Rahma Abdelfatah, menna shama; Mansoura/Egito; publicado 16/08/2026). 33 pranchas. Crianças de 3 a 8 anos, árabe-primeiro com inglês.
- **Captain Cash — The Future of Financial Literacy for Kids** (Hanaa Mohammed e equipe, ITI; Aswan/Egito; publicado 24/07/2026). 35 pranchas. Crianças de 7 a 11 anos, árabe-primeiro, mercado egípcio.

Os dois são estudos de caso conceituais, não produtos com resultado de aprendizagem medido. O valor deles aqui é de **desenho de experiência e de método de pesquisa**, não de evidência pedagógica. Nada abaixo autoriza copiar arte, mascote, nome, ilustração ou texto: o que se aproveita são padrões de interação e decisões de produto.

---

## 1. Estudo — RIMI

### 1.1 Posicionamento

“Learning Through Adventure”. Promessa dupla e declarada na capa: **feito para a criança e para o responsável**. As oito funcionalidades-chave que o próprio case lista, na ordem em que aparecem:

| # | Funcionalidade | Descrição do case |
| --- | --- | --- |
| 1 | Interactive Worlds | Aprender por aventuras |
| 2 | Learning Companion | Personagem que guia e motiva |
| 3 | Parent Dashboard | Progresso e tempo de tela |
| 4 | Weekly Insights | Relatórios simples de progresso |
| 5 | Real-Life Activities | Aprender fora da tela |
| 6 | Smart Rewards | Recompensas e conquistas |
| 7 | Interactive Stories | Aprender por histórias |
| 8 | Bilingual Learning | Árabe e inglês |

### 1.2 Método de pesquisa

Design thinking em cinco etapas (Empathize → Define → Ideate → Prototype → Test), com cada etapa aberta por uma prancha-divisor. Artefatos produzidos:

- **Market research** em quatro colunas: oportunidades de mercado, necessidades dos usuários, usuários-alvo (primário: criança 3–8; secundário: responsável) e ameaças.
- **Problem statement** em três pares problema→solução: (a) o responsável não conhece o nível real do filho; (b) a criança perde foco no método tradicional; (c) necessidades variam muito por idade.
- **Parent interview** com 10 perguntas abertas, incluindo duas excelentes: *“o que faz seu filho continuar uma atividade até o fim, e o que faz ele parar?”* e *“o que faria você confiar em um app educativo?”*.
- **Survey** com amostra pequena (as frações 41,7% / 33,3% / 25% indicam 12 respondentes). Achados que o case destaca: 66,7% “perde foco rápido”; 75% escolhem por “conteúdo educativo útil” e “segurança/sem anúncios”; 75% querem saber “tempo gasto aprendendo”; 66,7% temem “tempo de tela excessivo”.
- **Affinity mapping** em cinco blocos: problemas dos pais, necessidades dos pais, features desejadas, oportunidades de melhoria, desafios de aprendizagem — mais uma faixa de *key insights* transversal.
- **Personas duplas**: Sara (mãe que trabalha) e Omar (6 anos), cada uma com goals, needs, pain points, behavior, motivations e uma citação.
- **Empathy maps separados** para pais e para crianças (Says / Thinks / Does / Feels).
- **Competitor analysis** em matriz: LingoKids, Khan Academy Kids, Lamsa × RIMI, com nove critérios (mercado, idade, idiomas, estilo de aprendizagem, tarefas do mundo real, dashboard do responsável, gratuito/pago, UI, modo offline) e uma prancha de *resultados* que converte cada fraqueza da concorrência em oportunidade.
- **Business model** simplificado em três colunas (custo / valor / receita).

### 1.3 Arquitetura da experiência

Um único app com **dois modos**: modo criança e modo responsável, separados por **PIN de 4 dígitos** criado no primeiro acesso. O fluxo do case mostra a raiz `estado da criança` com três ramos (personagem, aventuras, tela principal) e o ramo `configurações do responsável` atrás do PIN.

A navegação da criança é uma barra inferior de três destinos: personagem, mapa, casa.

Hierarquia de conteúdo: **mundo temático → mapa de trilha → sub-área → lição**. Quatro mundos (Floresta, Espaço, Heróis, Mar), cada um com identidade visual completa e própria — o mundo Espaço é escuro e estrelado, o mundo Floresta é claro e verde. Dentro do mundo Espaço, a trilha são os planetas em sequência, com cadeado nos não abertos; dentro da Floresta, uma estrada de terra com nós marcados por mochilas.

### 1.4 Player de lição

Sequência observada em “Discover Mercury”: barra de progresso segmentada com `1/10` → pergunta com quatro imagens grandes → seleção marcada com check verde → feedback imediato (“أحسنت! resposta correta”) com uma micro-informação extra → próxima questão de formato diferente (arrastar letras para formar palavra) → tela de conclusão com `9/10`, `900 pontos` e o badge “Explorador de Mercúrio” → tela de desbloqueio do planeta seguinte com confete.

Dois detalhes de execução relevantes:

1. **Ícone de áudio em cada card.** O público é pré-leitor, então cada palavra, número e animal tem alto-falante próprio. Áudio não é acessório: é o canal primário.
2. **Formato alternado dentro da mesma lição.** Escolha, arrastar, ordenar — a variedade é o antídoto do tédio declarado na pesquisa.

### 1.5 Gamificação

Moedas e gemas no topo da tela da criança. Personagens e companheiros compráveis, com cadeado e preço visível (1000, 3000, 5500). Estrelas por mundo (`13/30`, `3/30`). Badges. E um card “sua próxima recompensa: junte 20 badges para ganhar um presente novo”, com barra de progresso — antecipação explícita.

### 1.6 Área do responsável

Dashboard próprio, com registro visual diferente (barra superior roxa, densidade de app adulto):

- Card do filho com avatar, idade e nível, e barra de progresso.
- Três KPIs: badges, dias seguidos, minutos.
- “Últimas atividades” em timeline curta.
- **“Nível de habilidades”**: uma barra percentual + estrelas por habilidade (80%, 85%, 65%, 60%), mais blocos separados de **pontos fortes** e **precisa de treino**, escritos em frase.
- Adicionar filho em duas abas: dados (nome, idade em grid de botões, gênero, tempo diário) e **interesses**, escolhidos num grid de 12 ícones temáticos.
- Configurações: tempo de uso diário, notificações, idioma, modo de proteção.

---

## 2. Estudo — Captain Cash

### 2.1 Posicionamento

“Helping children build financial habits through play, saving, and storytelling.” A tese do produto é uma progressão de três degraus, repetida na marca (“LEARN · SAVE · INVEST”) e no SWOT: **aprender → poupar → investir**.

O case é explícito sobre a decisão estratégica: *“focar primeiro em engajamento e formação de hábito, e só depois expandir para poupança e investimento”*. E é honesto sobre o limite da própria pesquisa: *“acreditamos que o Captain Cash deve começar pelo entendimento do dinheiro, não pela transação — mas isso precisa ser validado com famílias reais antes de se tornar um princípio de design.”*

### 2.2 Método de pesquisa — o que este case faz melhor

Muito mais robusto que o RIMI, e diretamente aproveitável:

- **Affinity map em três camadas**: `Raw Quotes` → `Pattern` → `Insight`. Seis temas para pais (Responsabilidade antes do dinheiro, Personalidades diferentes, Confiança e segurança, Mentalidade de investimento, Queda de motivação, Ansiedade parental) e seis para crianças (Motivação para poupar, Recompensa e competição, Hábitos digitais, Estilo de aprendizagem, Apoio dos pais, Influência social). Cada tema termina numa frase curta e acionável: *“crianças poupam para ter, não para poupar”*; *“pais buscam orientação com supervisão, não autonomia completa”*; *“confiança é pré-requisito da adoção”*.
- **Duas personas para a mesma criança**: `Kid Persona` (comportamento financeiro, motivações, dores) e `Player Persona` (“The Competitive Achiever”: metas de jogo, estilo de jogo, frustrações). Separar a persona pedagógica da persona de jogador é a melhor ideia de método dos dois cases.
- **JTBD explícito** para os dois lados. O do responsável: *“quando meu filho começa a receber dinheiro, quero que ele aprenda decisões financeiras conscientes, para se tornar financeiramente responsável antes de ter independência total.”*
- **Journey maps de seis estágios** — Pre-Awareness, The Trigger, First Impression, Daily Engagement, Social Interaction, Goal Achievement — com cinco faixas por estágio: ações, pensamentos, pontos de dor, emoções (rosto ilustrado) e **oportunidades**. Um mapa para o responsável, um para a criança.
- **Matriz de experiência** contra Cashee, Greenlight, Leap, Maaly e GoHenry, com sete critérios de *posicionamento* (foco no engajamento da criança, letramento financeiro, sistema de formação de hábito, experiência árabe-primeiro, narrativa como mecanismo de engajamento, jornada de aprendizagem de longo prazo, acesso a investimento real) — mais uma nota metodológica: *“a comparação trata de posicionamento e experiência, não de completude de features.”*
- **Concorrentes indiretos** nomeados: Roblox, jogos móveis, YouTube Kids (entretenimento); Duolingo, Khan Academy Kids (educação); cofrinho e mesada em dinheiro (métodos tradicionais). A ameaça declarada é a **atenção**, não o concorrente financeiro.
- **SWOT** fechado em quatro frases: maior força, maior oportunidade, maior ameaça, decisão estratégica mais importante.
- **Brainstorming HMW** com seis perguntas, cada uma resolvida em três a quatro direções.
- **Mapa do tesouro de priorização**: os eixos são valor × esforço, desenhados como uma rota de navegação. Baixo esforço/alto valor no quadrante certo, tudo nomeado. É a mesma matriz de sempre, mas contada na linguagem do produto.
- **Testes de usabilidade** com tabela real (tarefa, cenário, objetivo, tempo estimado, objetivo alcançado, tempo real, nota 1–5, observação, peso do problema, desfecho), separados para pais e crianças, com fotos e pranchas “OOPS! / SUCCESS!” mostrando o antes e o depois do problema encontrado.

### 2.3 Arquitetura

**Dois aplicativos distintos** — app da criança (mundo isométrico jogável) e app do responsável (painel comportamental e financeiro) — com um código de segurança de 4 dígitos ligando os dois (“Family Safety Code”).

O mundo da criança é um arquipélago: ilhas por tema (poupar, ganhar, trocar), cada uma um cenário isométrico navegável com joystick, personagens e diálogos em balão. O mapa do tesouro é a metáfora estrutural do produto inteiro — aparece no processo, na priorização e na navegação.

### 2.4 Mascote

**Bashir**, um papagaio pirata, é a voz contínua do produto e não um adesivo. Ele aparece:

- dando conselho antes de uma decisão (“nota do Bashir…”);
- comentando resultado de investimento;
- pedindo pausa quando o tempo de tela acaba;
- revisando as atividades da pausa e devolvendo elogio;
- no painel do responsável, como **“Bashir’s advice”**, assinando três blocos por semana: análise do comportamento financeiro, oportunidade de melhoria e uma sugestão para a família.

### 2.5 Tempo de tela — o melhor padrão dos dois cases

Sequência completa, com cinco pranchas dedicadas:

1. **Screen Time Reminder** — ao atingir o limite, o jogo pausa e Bashir convida a uma pausa curta “para proteger os olhos”.
2. **Healthy Break Activities** — três cards de atividade do mundo real em categorias de bem-estar: beber um copo grande de água e oferecer um ao responsável; 10 agachamentos; arrumar o quarto e a cama ajudando a mãe.
3. **Complete the Mission** — a criança **grava por voz** o que fez; o app registra o histórico de hábitos.
4. **Personalized Feedback** — Bashir comenta as atividades e reforça o hábito digital saudável.
5. **Earn Your Reward** — +50 moedas ao concluir.

O limite de tela deixa de ser uma parede imposta pelo responsável e passa a ser **conteúdo do produto**. É a conversão mais inteligente do case: transforma a maior objeção da pesquisa (“66,7% temem tempo de tela excessivo”) em funcionalidade desejável.

### 2.6 Desafio da família

Card principal do app do responsável: **“Desafio da família”** com meta única compartilhada (600 EGP, 60% concluído), lista de participantes (Hoda, Saif, Hamza) com contribuição de cada um, regras editáveis e botão de encerrar. Cooperativo, não competitivo: uma barra só, somando todos.

### 2.7 Painel do responsável

- Home com o desafio da família, ações rápidas (“adicionar filho”, “registrar poupança”) e **“últimas atualizações”** escritas em linguagem comportamental, não numérica: *“Ahmed — atividade excelente: concluiu 3 níveis e jogou em tempo adequado”*; *“Sara — atividade em queda: precisa de incentivo para concluir”*.
- Relatórios com gráfico de portfólio, distribuição entre gastar/poupar/ganhar em rosca, e **limite de perda configurável** pelo responsável com botão “pausar investimento”.
- Notificações configuráveis por canal (imediata, SMS, e-mail) e por periodicidade (resumo diário, relatório semanal).
- Assinatura 49 EGP/mês ou 399/ano, com tema escuro completo.

### 2.8 Design system

O único dos dois cases com design system declarado: variáveis de cor no Figma com colunas **light e dark** para cada token (`aqua_mint/50` … `/800`), escala de espaçamento base (0, 1, 2, 4, 8, 12, 16, 20, 24, 28), duas famílias (**Tajawal** para títulos, **Cairo** para corpo) e componentes em todos os estados (botão em 4 estados, OTP, popup, input, navegação). Wireframes em cinza antes da UI final. Landing page própria, responsiva, com versão mobile desenhada lado a lado.

---

## 3. Síntese — os dez padrões que valem

| # | Padrão | Onde aparece | Tese |
| --- | --- | --- | --- |
| 1 | Lugar antes de lista | Mundos do RIMI, ilhas do Captain Cash | A criança quer *ir* a algum lugar, não percorrer um índice |
| 2 | Mascote com voz contínua | Bashir | O personagem deve dizer algo verdadeiro sobre o conteúdo, não sorrir no canto |
| 3 | Área do responsável é produto | Skills level, Bashir’s advice | O adulto compra leitura, não planilha |
| 4 | Onboarding narra antes de pedir | Três telas ilustradas antes do formulário | A promessa precisa ser sentida antes do cadastro |
| 5 | Progresso fracionado e visível | `13/30`, `9/10`, “junte 20 badges” | Progresso invisível é o motivo declarado da queda de motivação |
| 6 | Tempo de tela como valor | Healthy Break Activities | A maior objeção do comprador vira funcionalidade |
| 7 | Cooperação, não ranking | Desafio da família | Meta somada entre irmãos, barra única |
| 8 | Citação crua → padrão → insight | Affinity maps do Captain Cash | Método de pesquisa reaproveitável imediatamente |
| 9 | Tokens com dois temas | Design system do Captain Cash | Tema escuro é requisito, não enfeite |
| 10 | Áudio como canal primário | Alto-falante em cada card | Leitura não pode ser gargalo do raciocínio |

### O que **não** trazer

Registrado explicitamente porque é a fronteira da essência do Missão Saber:

- **Economia de moedas e gemas com itens comprados** e personagens bloqueados por preço. Cria pressão de consumo dentro de um produto infantil já pago e desloca o objetivo do aprendizado para a coleção.
- **Ranking, PvP e leaderboard entre crianças.** A `PROPOSTA.md` §5 proíbe comparação pública entre crianças, e a landing page promete isso ao comprador (“sem comparação pública entre crianças”). *Exceção registrada em 31/10/2026:* a titular aprovou a competição em família com pódio privado, visível só na conta do responsável e coordenada por ele ([proposta da competição](../missao-saber-competicao-2026-10-31/PROPOSTA.md)). Continua valendo para tudo o que a criança vê: nada de ranking no espaço de estudo, e o Desafio da família segue cooperativo.
- **Ofensiva com perda** (a corrente que quebra). `BolhasSemana` foi feito deliberadamente como contagem, não corrente — está comentado no próprio componente.
- **Badge por minutos ou por dias seguidos.** Mede presença, não compreensão.
- **Recompensa por volume de respostas.** Incentiva repetir a mesma família de item, exatamente o que o motor de evidência existe para não premiar.
- **Simulador de investimento.** No Missão Saber, educação financeira é conteúdo curricular; a proposta veda recomendação individualizada e condução a produtos financeiros.
- **Ilustração e cenário de banco de imagens.** Direitos e identidade — o produto tem mascote e linguagem visual autorais.
- **Tutor de IA aberto no centro da experiência.** Permanece exploração posterior, com contexto restrito.

---

## 4. A essência a preservar

Antes de propor, o que não se mexe. Levantado do código, não da intenção:

| Pilar | Onde vive hoje |
| --- | --- |
| “Não há vidas para perder. Uma tentativa difícil mostra por onde continuar.” | `app/(app)/hoje/page.tsx`, rodapé da tela |
| “Ainda não sei” é resposta válida, registrada e usada na recomendação | `player.tsx` (`__skip__`), `recommendation.ts` |
| Evidência de autonomia ≠ pontuação: três níveis, famílias distintas de item, acerto sem pista, em dias diferentes | `engine.ts` → `skillStates`, `SeloHabilidade` |
| Revisão espaçada 1/3/7/14/30, voltando a um dia após erro ou apoio | `engine.ts` → `spacedDue`, `intervals` |
| Banco de avaliação reservado, com controle de exposição e rótulo honesto quando esgota | `assessmentNovelty` em `simulados/page.tsx` |
| Correção e gabarito no servidor; devolutiva escondida até o fim em diagnóstico e simulado | `service.ts`, `player.tsx` |
| Pista gradual em três níveis, registrada na evidência | `hintAction`, `helpCount` |
| Devolutiva específica por alternativa errada | `engine.ts` → `item.misconceptions[answer]` |
| Cor nunca carrega sozinha o significado; tons sólidos calibrados a ≥4,5:1; `prefers-reduced-motion` respeitado | `globals.css`, `selo-habilidade.tsx` |
| Duas peles no mesmo sistema: criança com sombra sólida e mascote, responsável em densidade adulta | `familia/page.tsx` (comentário de cabeçalho) |
| Área da família exige login de menos de dez minutos | `familia/page.tsx` |
| Relato de problema sem dados pessoais, com trilha até a manutenção | `ItemReport`, `manutencao/page.tsx` |
| Rotina é sugestão: sem bloqueio de estudo, sem punição, **sem lembrete ao estudante** | `Routine` em `family-controls.tsx` |
| Conteúdo autoral, versionado, suspensível item a item | `availability.ts`, `version.ts` |

Qualquer proposta abaixo que colidisse com essa lista foi descartada ou reescrita.

---

## 5. Diagnóstico — onde os cases expõem lacunas reais

1. **As quatro trilhas não têm território.** `/jornada` tem nomes excelentes (“Dinheiro com propósito”, “Olhar de explorador”, “Conectar ideias”, “Pensar além da conta”) e uma trilha de nós bem feita (`NoTrilha`, caminho central alternando lados), mas visualmente é uma lista sobre papel bege. Os dois cases constroem lugares distintos por tema.
2. **Faísca é decorativo.** Cinco humores implementados (`acolhendo`, `pensando`, `comemorando`, `encorajando`, `descansando`) e um desenho autoral bonito — mas o mascote aparece no cabeçalho, no rail e na tela de conclusão, e **não fala em nenhum momento durante a missão**. A `PainelDevolutiva` mostra “Vamos encontrar o caminho.” sem rosto e sem voz.
3. **A devolutiva específica existe só para alternativas.** `misconceptions[answer]` dá feedback por opção errada em itens `choice`. Para `numeric` e `ordering`, o erro cai na `explanation` genérica da questão. É o formato mais novo do catálogo e o que tem a devolutiva mais fraca.
4. **`/experimentar` é a tela mais fraca do produto.** É a primeira impressão, e é uma questão solta numa coluna estreita: sem Faísca, sem senso de lugar, sem progresso, sem nomear a estratégia aprendida. Os dois cases abrem com três telas ilustradas de storytelling.
5. **O relatório familiar é tabela, não leitura.** A `PROPOSTA.md` §6 prometeu a frase: *“Nesta semana, resolveu três problemas novos de comparação de preços sem ajuda. Ainda precisa representar a fração antes de calcular. Na próxima semana, vamos trabalhar essa ponte.”* O que existe são quatro fragmentos em caixas (“Próxima ação: …”, “Dificuldades repetidas: …”) mais uma `<Table>`. Os dados para a frase já estão todos calculados.
6. **Nada fora da tela.** `Real-Life Activities` é a funcionalidade nº 5 do RIMI e o insight central do Captain Cash (“pais são guias, não observadores”). O Missão Saber não oferece nenhuma sugestão de apoio em casa.
7. **Leitura em voz alta não existe.** A `PROPOSTA.md` §5 previu como recurso de acesso e alertou sobre o efeito no construto em simulado. Nenhuma linha de `speechSynthesis` no código.
8. **O tempo sugerido não faz nada.** `family.dailyMinutes` é escolhido pelo responsável (5/10/15/20 min) e aparece em `/hoje` como texto (“cerca de 10 min no seu ritmo”). Nunca é atingido, nunca é comemorado, nunca propõe pausa.
9. **Os perfis são silos.** Até três estudantes, cada um com progresso próprio e nenhum ponto de encontro. O Desafio da Família do Captain Cash mostra a alternativa cooperativa.
10. **Não há tema escuro.** `globals.css` define a paleta inteira em `:root`, sem `prefers-color-scheme` nem `[data-theme]`. A escala é oklch, o que torna a derivação viável — mas os tons `*-solido` foram calibrados para texto branco a ≥4,5:1 e precisam de recalibração explícita, não inversão.
11. **O desafio profundo do laboratório é fixo.** “Uma borda, muitas possibilidades” está escrito à mão em `laboratorio/page.tsx`, com rubrica e passos. É um único desafio para todo o catálogo.
12. **O laboratório não pede previsão.** O ciclo da proposta é *prever → manipular → observar → explicar*. Os três laboratórios (barras, malha, grupos) começam na manipulação.
13. **`/meu-espaco` é um índice de links.** Quatro cards sem nenhum número: quantas descobertas guardadas, qual foi o último percurso, quantos simulados feitos.
14. **PWA sem offline.** Há `manifest.webmanifest` e `themeColor` — instalável. Não há service worker. O `agenda-da-turma` tem `public/sw.js`, mas só para push, sem cache.

---

## 6. Proposta

Cinco blocos. Cada item traz o que muda, por que (case + evidência no app), onde mexe e o que preserva.

### Bloco A — Dar lugar ao aprendizado

**A1. Quatro territórios, não quatro cards.**
Cada trilha recebe um horizonte autoral em SVG paramétrico, usando o tom que ela já tem (verde, uva, sol, céu), e a trilha de nós passa a correr por esse horizonte. Não é ilustração raster nem cenário comprado: é um `<svg>` de colinas, dunas, estrelas ou ondas gerado por parâmetros, leve, escalável e derivado dos tokens — portanto compatível com tema escuro e com `prefers-reduced-motion`.
*Onde:* novo `components/ui/horizonte.tsx`; `jornada/page.tsx` envolve cada capítulo.
*Preserva:* nenhum nó novo bloqueado artificialmente — `NoTrilha` já só bloqueia por plano ou suspensão.

**A2. Progresso fracionado por capítulo.**
A faixa de capítulo em `/jornada` já mostra nome da habilidade e `SeloHabilidade`. Ganha `7/12 descobertas` e uma barra. O dado existe: `estados` já calcula `done` por lição.
*Por que:* “progresso invisível” é o padrão de queda de motivação nomeado nos dois cases.
*Preserva:* conta descobertas concluídas, não estrelas nem pontos — e o selo de autonomia continua sendo a medida pedagógica, ao lado.

**A3. `/meu-espaco` com números reais.**
Os quatro cards ganham um dado cada: “14 descobertas guardadas”, “último percurso: 12/09”, “3 simulados”, “relatório da semana pronto”.
*Onde:* `meu-espaco/page.tsx` passa a ser `async` e lê o que `currentDashboard()` e `listNotes` já retornam.

### Bloco B — Faísca ganha voz

**B1. Faísca fala na devolutiva. (maior ganho por esforço da proposta inteira)**
`PainelDevolutiva` recebe o mascote com humor derivado do resultado (`comemorando` / `encorajando`) e uma fala curta **vinda do conteúdo**:

- `choice`: a `misconception` da alternativa escolhida — já existe, só não tem rosto nem voz;
- `numeric`: novo campo opcional `misreads` no schema, no mesmo espírito de `misconceptions` (valor errado comum → explicação do que foi aplicado onde). Contrato novo, compatível com snapshots antigos pela mesma preprocessagem já usada em `itemSchema`;
- `ordering`: o primeiro par de precedência violado, dito em português;
- `justification`: o primeiro critério da rubrica ainda não atendido.

É a diferença entre *“Vamos encontrar o caminho.”* e *“Você aplicou os 10% sobre R$ 200, não sobre o preço já reduzido.”*
*Onde:* `painel-devolutiva.tsx`, `engine.ts`, `content/types.ts`.
*Preserva:* zero invenção — cada fala é conteúdo autoral revisado, não geração automática.

**B2. Faísca abre a missão.**
`view.lesson.introduction` existe e hoje está escondido num `<details>` (“Antes de começar: uma ideia que ajuda”) na primeira questão. Vira um balão visível da Faísca, com o humor `encorajando`.
*Onde:* `player.tsx`, primeiras linhas do `index === 0`.

**B3. O laboratório pede previsão.**
Antes de manipular, um passo “Qual é sua aposta?” com resposta curta, guardada. Depois de manipular, “O que você observou?”. As duas linhas vão para o caderno junto com o experimento salvo.
*Onde:* `labs.tsx`, `save-experiment.tsx`, `repository.ts` dos labs.
*Por que:* fecha o ciclo *prever → manipular → observar → explicar* que a `PROPOSTA.md` §5 define e o código ainda não cumpre.

**B4. Desafio profundo por habilidade.**
Tirar “Uma borda, muitas possibilidades” do JSX e transformar em conteúdo: um desafio de 20–30 min por habilidade, com rubrica, passos e o laboratório apropriado. O `/laboratorio` passa a mostrar o desafio da habilidade em construção no momento.
*Onde:* novo arquivo em `features/content/`; `laboratorio/page.tsx` consome.

### Bloco C — O responsável recebe leitura, não tabela

**C1. A frase da semana, determinística.**
Um gerador por regras (sem IA, sem custo, testável) que compõe a frase prometida a partir de `weeklyEvidence`, `skillStates`, `repeatedDifficulties` e `nextSkill` — todos já calculados em `familia/page.tsx`. Modelo:

> “Nesta semana, {apelido} resolveu {n} problemas novos de {habilidade} sem pistas, em {d} dias diferentes. Ainda precisa de apoio em {dificuldade}. O próximo passo é {próxima habilidade}.”

Com as variantes honestas para semana vazia, semana só com pistas e semana só de revisão. A `<Table>` continua abaixo, como evidência da frase; o `<details>` “ver tentativas que sustentam o relatório” já existe e passa a ser o link natural.
*Onde:* novo `features/learning/relato.ts` + teste; `familia/page.tsx` renderiza no topo do card.
*Preserva:* nenhuma alegação de domínio ou de capacidade; a frase cita evidência e não classifica a criança.

**C2. “Como apoiar em casa”, uma por habilidade.**
Duas ou três frases autorais por habilidade, sem tela: medir algo da cozinha em frações, comparar dois preços por unidade no mercado, procurar simetria num azulejo. Aparece no card do filho, ao lado da frase da semana.
*Por que:* é a `Real-Life Activities` do RIMI e a resposta ao insight mais forte do Captain Cash (“pais são guias, não observadores”) — e é a única melhoria da lista que aumenta o aprendizado **reduzindo** tempo de tela.

**C3. Resumo semanal por e-mail, opt-in, só para o responsável.**
O pipeline `@informach/emails` já é idempotente por `(category, messageKey)` e tem os três modos. O corpo é a frase de C1 mais o “como apoiar em casa”.
*Preserva:* a decisão explícita de `Routine` — *“não enviamos lembretes ao estudante”*. O destinatário é sempre a conta do responsável.

**C4. Devolutiva de simulado com referência ao percurso anterior.**
A tabela de habilidades ao fim do simulado ganha uma coluna com o percurso anterior (`4/6 → 5/6`), sem nota e sem média.
*Onde:* `player.tsx`, bloco `assessment`; os dados vêm de `data.recent`.

### Bloco D — Família junto, sem competição

**D1. Desafio da família, cooperativo.**
Uma meta única e somada entre todos os perfis, proposta pelo app e aceita pelo responsável. A meta é de **variedade**, não de volume nem de velocidade: *“12 descobertas em estratégias diferentes nesta semana”*. Uma barra só, com a contribuição de cada perfil visível mas sem ordenação nem destaque de quem fez mais. Sem prazo punitivo: a semana termina, a barra recomeça, nada se perde.
*Onde:* nova tabela em `@informach/db` schema `missao_saber`; card em `/hoje` e em `/familia`.
*Preserva:* zero comparação entre irmãos; a promessa da landing (“sem comparação pública entre crianças”) continua verdadeira.

**D2. Pausa do explorador — oferta, nunca parede.**
Ao passar do tempo sugerido, a Faísca **oferece** uma pausa de dois minutos com uma atividade fora da tela ligada ao que acabou de ser estudado. A criança pode aceitar, adiar ou dispensar; o botão de continuar a missão nunca desaparece. O registro da pausa é opcional e não vale recompensa.
*Onde:* `player.tsx` (client, contando o tempo da sessão), `family.dailyMinutes`.
*Preserva:* a regra escrita em `Routine` — sem bloqueio de estudo e sem punição. É a adaptação do melhor padrão do Captain Cash às restrições do Missão Saber: mesma ideia, sem a moeda e sem a parede.

**D3. Reencontro sem culpa.**
`BolhasSemana` continua contagem, não corrente. Depois de uma ausência, `/hoje` abre com a Faísca em `acolhendo` e uma linha de reencontro: *“Bom te ver de novo. A revisão de frações esperou por você.”* Nunca “você perdeu N dias”.
*Onde:* `hoje/page.tsx`, derivado de `data.weekly` e da data da última evidência.

### Bloco E — Fundações

**E1. Tema escuro.**
Reestruturar `globals.css`: `:root` mantém a paleta clara completa; um bloco `@media (prefers-color-scheme: dark)` guardado como `:root:not([data-theme="light"])` redefine **só os tokens**; `:root[data-theme="dark"]` repete para o seletor manual. A escala oklch ajuda (mesmo C e H, L deslocado), mas os quatro tons `*-solido` precisam de recalibração medida, não inversão: eles foram escolhidos para branco a ≥4,5:1 sobre fundo claro. Seletor de tema em `/meu-espaco`, persistido no perfil.
*Por que:* o horário de estudo real é a noite; é o único item da proposta que o próprio design system do Captain Cash trata como requisito de base.

**E2. Leitura em voz alta, opt-in.**
`window.speechSynthesis` com `pt-BR` no enunciado, na pista e na explicação. Custo zero, nenhum dado sai do aparelho. Botão de alto-falante ao lado do enunciado, como nos cards do RIMI.
*Preserva:* em diagnóstico e simulado, o recurso é marcado como apoio de acesso na sessão — a `PROPOSTA.md` §5 alerta que a leitura pode alterar o construto avaliado. Nunca lê alternativa marcada como correta nem texto de solução.

**E3. Refazer `/experimentar`.**
A tela que decide a assinatura passa a ter: uma abertura com a Faísca e a promessa; a previsão antes da conta (“qual é sua aposta?”); a manipulação no laboratório de barras; a devolutiva com a fala da Faísca; e o fechamento que **nomeia a estratégia**: *“você acabou de usar uma estratégia: aplicar porcentagem sobre o valor já alterado”* — e só então o convite a criar conta.
*Preserva:* continua sem cadastro, sem cartão, sem salvar dados e sem atribuir domínio, como o próprio card já diz.

**E4. Offline das missões abertas (depois).**
Service worker com cache das missões já baixadas, para leitura e resposta em fila. Fica explicitamente fora do escopo curto: exige decidir conflito de tentativa, e **simulado nunca pode ir offline** — o gabarito é do servidor por decisão de arquitetura. Vale como diferencial de mercado (os dois cases o listam), não como próximo passo.

---

## 7. Priorização

Valor × esforço, na linguagem do produto: o que está perto do acampamento e o que exige expedição.

| Fase | Itens | Por que agora |
| --- | --- | --- |
| **1 — Perto do acampamento** (alto valor, baixo esforço) | B1, B2, C1, D3, A2 | Todos usam dados e conteúdo que já existem. B1 e C1 corrigem as duas promessas mais explícitas da proposta original que o código ainda não cumpre. |
| **2 — Primeira trilha** | E3, E2, C2, A3, C4 | `/experimentar` é a tela de conversão; voz e apoio em casa ampliam o alcance sem alterar contratos. |
| **3 — Expedição** | A1, D1, D2, E1, C3, B3 | Exigem arte nova, tabela nova, recalibração de contraste ou pipeline de e-mail. |
| **4 — Além do mapa** | B4, E4 | B4 depende de produção de conteúdo por habilidade; E4 exige service worker e política de conflito. |

---

## 8. Como saber se melhorou

Amarrado nas métricas que a `PROPOSTA.md` §8 já definiu, para não criar um segundo painel:

| Métrica existente | Meta declarada | Itens que a atacam |
| --- | --- | --- |
| Contas que concluem diagnóstico e primeira missão em 48h | ≥ 60% | E3, B2 |
| Estudantes com ≥ 3 sessões/semana na 4ª semana | ≥ 40% | A1, A2, D1, D3 |
| Coorte que volta e aprende na 4ª semana | ≥ 35% | B1, D3, E2 |
| Responsáveis que leem o relatório e sabem explicar a evolução | ≥ 60% | C1, C2, C3 |
| Ativados expostos à oferta que compram | faixa 8–15% a testar | E3, C1 |
| **Métrica principal: estudantes que demonstram aprendizagem independente e retornam na semana seguinte** | sinal consistente | B1, B3, C4, E2 |

Duas medidas novas, ambas baratas:

- **Leitura da devolutiva**: proporção de erros em que o estudante continua depois de a explicação estar na tela por mais de alguns segundos. Diagnostica B1 diretamente.
- **Aceitação da pausa**: proporção de pausas oferecidas que são aceitas. Se for baixa, a pausa está mal colocada — não se deve transformá-la em bloqueio para “melhorar” o número.

---

## 9. Riscos

| Risco | Sinal antecipado | Resposta |
| --- | --- | --- |
| Território visual (A1) pesa o carregamento ou compete com o enunciado | queda de sessões concluídas; enunciado com menos atenção | SVG paramétrico, nunca raster; horizonte sempre atrás do conteúdo, com contraste medido |
| Fala da Faísca (B1) soar condescendente | relatos de “o app fala demais” | a fala é sempre uma informação sobre o erro, nunca um elogio vazio; uma linha, no máximo |
| Frase da semana (C1) virar promessa de domínio | responsável citando a frase como avaliação | vocabulário fechado por regra, sem adjetivo de capacidade; a tabela de evidência fica sempre visível |
| Desafio da família (D1) criar competição involuntária entre irmãos | pedido de ver “quem fez mais” | não ordenar contribuições, não destacar maior contribuinte, não fechar a barra com um vencedor |
| Pausa (D2) ser sentida como bloqueio | dispensa imediata recorrente; reclamação do estudante | continuar a missão permanece a ação mais fácil da tela; a pausa não dá recompensa |
| Tema escuro (E1) quebrar o contraste calibrado | par de cor abaixo de 4,5:1 | recalibrar os quatro tons sólidos com medição, não inversão; o teste de contraste entra na verificação |
| Voz (E2) alterar o construto em simulado | desempenho em simulado descolado do treino | marcar a sessão como “com apoio de leitura” e nunca ler solução |

---

## 10. Limites deste estudo

Os dois cases são projetos conceituais publicados em portfólio: não há produto em operação, coorte medida nem resultado de aprendizagem. Seus números de pesquisa vêm de amostras pequenas (o survey do RIMI aparenta 12 respondentes) e de um contexto cultural e regulatório diferente — Egito, árabe-primeiro, com infraestrutura bancária jovem como premissa do Captain Cash. Nada disso valida qualquer hipótese para o mercado brasileiro, para a faixa de 6º/7º ano nem para preparação olímpica.

Este documento também não implementa nada, não altera dados de produção e não mediu o app com estudantes. A análise do Missão Saber é de código e de documentação (`src/`, `PROPOSTA.md`, `PLANO-VERSAO-COMERCIAL.md`, `README.md`), mais navegação anônima nas telas públicas (`/`, `/experimentar`, `/entrar`) rodando localmente. As telas autenticadas — `/hoje`, `/jornada`, `/laboratorio`, `/revisao`, `/familia` — foram lidas no código, não vistas em execução.
