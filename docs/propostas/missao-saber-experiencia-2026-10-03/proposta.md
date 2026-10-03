# Missão Saber — proposta de experiência para famílias e estudantes

**Data:** 3 de outubro de 2026. **Estado:** implementação concluída e verificada no workspace; publicação em produção e validação com famílias pendentes. Consulte a [correspondência de requisitos, evidências e validações pendentes](implementacao-e-verificacao.md). O diagnóstico e o conceito abaixo registram a análise anterior à implementação.

**Recomendação:** organizar o Missão Saber em dois espaços explícitos — **Área do responsável** e **Área de estudo** — ligados por uma passagem clara entre quem acompanha e quem aprende. Em cada situação, apresentar uma ação principal adequada ao momento. Preservar o motor pedagógico, as trilhas e o laboratório já construídos.

O problema central encontrado é a mistura de contextos: o responsável chega a uma página de gestão com navegação de estudante; ao criar um perfil, passa diretamente para uma página dirigida à criança. O estudante encontra uma boa recomendação em “Hoje”, mas precisa entender sozinho como missão, diagnóstico, trilha, revisão, laboratório e caderno se relacionam.

## 1. Como a análise foi feita

- Inspeção do código de autenticação, seleção de perfil, navegação, família, página Hoje, jornada, revisão, simulados, laboratório, caderno e conclusão de missão, na base `c7b22d53327180692f432ed9185ac46140d6e4f0`.
- Percurso real em navegador: cadastro de responsável fictício, confirmação por e-mail local, família sem perfil, criação de estudante do 6º ano, primeiro acesso a Hoje e retorno à família. Inspeção em computador e celular de 390 × 844 pixels.
- Consulta às páginas públicas e à documentação oficial de Khan Academy, Prodigy e Brilliant; pesquisa de usabilidade com crianças e adolescentes, acessibilidade cognitiva e participação familiar.
- Verificação das recomendações contra as capacidades existentes: conteúdo por ano escolar, sugestão de missão, retomada, revisão, pistas, investigação no laboratório e relatos para a família.

O percurso autenticado utilizou dados fictícios em um banco local de prévia. Foi necessário atualizar esse banco com as migrações já existentes; a defasagem local não foi tratada como defeito de produção. A página pública de entrada em produção também foi consultada. Não houve teste autenticado com contas reais em produção, entrevistas com famílias, consulta a métricas de abandono ou experimento de aprendizagem nesta etapa. A inspeção visual ao vivo não cobriu todas as combinações de ano, assinatura e histórico; os demais estados foram analisados pelo código. Os estudos externos orientam hipóteses, não comprovam o efeito de uma mudança no Missão Saber.

**Materiais:** [conceito navegável](conceito.html), [registro técnico dos achados](diagnostico.md). O conceito usa dados ilustrativos, não contém autenticação e não representa todas as telas finais.

Prévias estáticas do conceito: [responsável](evidencias/conceito-responsavel.png), [estudante dos anos iniciais](evidencias/conceito-estudante.png) e [ensino médio](evidencias/conceito-ensino-medio.png).

## 2. Diagnóstico e prioridades

| Prioridade | Achado observado | Consequência provável | Mudança proposta |
| --- | --- | --- | --- |
| Alta | Todo login termina em `/familia`; essa página usa o mesmo menu de estudo das demais páginas. | O adulto não reconhece um espaço próprio; o estudante entra por uma página administrativa. | Separar os espaços, lembrar o contexto autorizado do dispositivo e definir destinos de entrada por estado. |
| Alta | Criar perfil redireciona imediatamente para `/hoje`, que cumprimenta o estudante. | O responsável não recebe uma conclusão do cadastro nem uma orientação para entregar o aparelho. | Tela curta “Tudo pronto para Lua”, com “Começar estudo com Lua” e “Ir para meu painel”. |
| Alta | A identificação visual da área familiar é principalmente um ícone; o cartão do estudante remete ao seletor de perfil. | A passagem entre acompanhar e estudar depende de descobrir controles. | Rótulos visíveis e ações diretas: “Área do responsável”, “Abrir estudo de Lua”, “Trocar estudante”. |
| Alta | Família concentra perfis, todos os relatórios, rotina, desafio, assinatura e privacidade. | A primeira tarefa disputa atenção com acompanhamento e administração. | Painel resumido, acompanhamento por estudante e configurações em páginas próprias. |
| Alta | Não existe uma sessão de estudante distinta da sessão do titular; ações sensíveis usam confirmação recente. | Uma divisão somente visual não isolaria os papéis em aparelho compartilhado. | Escopo de estudante validado no servidor; confirmação do responsável para sair desse escopo. |
| Média | “Hoje” tem um bom botão principal, mas apresenta diagnóstico como outro começo e várias áreas sem explicar a sequência. | Dúvida sobre começar a missão ou fazer primeiro outra preparação. | Uma indicação principal por estado, diagnóstico opcional explicado e orientação contextual. |
| Média | O cadastro exige escolher uma trilha entre nomes e níveis de olimpíadas. | Famílias sem familiaridade com essas provas precisam decidir antes de entender a oferta. | Recomendação explicada por ano e interesse, com comparação curta e opção de ver outras trilhas. |
| Média | A primeira página do estudante já apresenta três métricas zeradas; textos de revisão explicam regras internas de evidência. | Pouco significado antes da primeira experiência; carga de leitura desnecessária para decidir o que fazer. | Mostrar orientação antes de haver histórico; explicar o progresso em linguagem comum e abrir os detalhes sob demanda. |
| Média | A estrutura visual e o tom geral são comuns às faixas escolares. | Possível percepção de infantilização entre adolescentes; isso ainda precisa de teste. | Adaptar apresentação e autonomia por faixa escolar, mantendo identidade e navegação consistentes. |
| Média | A duração “cerca de 10 min” vem da preferência familiar, não de uma estimativa daquela missão. | A interface pode sugerir uma precisão que o dado não oferece. | “Seu combinado: 10 minutos” e informação real sobre a atividade; só estimar duração quando houver base. |
| Baixa | A chamada do laboratório em Hoje ainda destaca apenas porcentagens, malhas e grupos. | A expansão recente fica pouco perceptível fora da biblioteca. | Chamada ligada ao assunto atual e exemplos adequados ao ano escolar. |

No celular observado, a área da família com um estudante sem atividade tinha aproximadamente **4.244 px de altura**, cerca de cinco alturas da janela de teste. Isso não prova abandono; demonstra quanto conteúdo antecede uma organização clara das tarefas. Em Hoje, o botão principal estava visível na primeira tela, sem rolagem horizontal. Portanto, o trabalho deve preservar essa boa hierarquia e corrigir principalmente entrada, contexto e continuidade.

### O que merece ser preservado

- Recomendação de missão, retomada de sessão e revisão fundamentadas nos dados existentes.
- Pistas graduais, leitura em voz alta e mensagens que permitem errar sem perder vidas.
- Distinção entre prática, tentativa com apoio e evidência de autonomia.
- Laboratório relacionado às habilidades e possibilidade de retomar uma investigação.
- Conclusão de missão com reflexão e próximo passo: já existe; precisa se conectar melhor à rotina.
- Atividades de apoio em casa, ausência de classificação entre irmãos e rotina sem punição por ausência.
- Oferta gratuita inicial, conteúdo filtrado por ano escolar e ausência de obrigação de fornecer e-mail da criança no cadastro atual.

## 3. O que a pesquisa acrescenta

| Referência | Evidência consultada | Aplicação proposta |
| --- | --- | --- |
| [Khan Academy — guia para responsáveis](https://support.khanacademy.org/hc/en-us/articles/360040168512-Khan-Academy-for-Parents-Quick-Start-Guide) | O fluxo distingue conta e painel do responsável da entrada da criança e do acompanhamento. | Tornar explícitas criação, vínculo, passagem para estudo e retorno ao acompanhamento. |
| [Prodigy — Painel dos Pais](https://prodigygame.zendesk.com/hc/pt/articles/115001744726-Painel-dos-Pais) | O painel organiza acompanhamento a partir do estudante vinculado e de sua atividade. | Selecionar quem acompanhar antes de abrir detalhes; oferecer resumo por estudante. |
| [Brilliant — Learning Paths](https://brilliant.org/help/features/what-are-learning-paths/) | Trilhas ordenam cursos e prática em uma sequência orientada. | Apresentar a trilha como caminho; a biblioteca fica disponível para exploração sem transferir toda a decisão inicial ao aluno. |
| [Brilliant — apoio familiar](https://brilliant.org/help/using-brilliant/how-can-parents-support-their-childs-learning/) | A orientação aos responsáveis enfatiza rotina, perguntas sobre estratégias e apoio sem exigir domínio do conteúdo. | Fazer o painel responder “Como posso ajudar hoje?” com uma conversa ou atividade curta. |
| [NN/g — estados vazios](https://www.nngroup.com/articles/empty-state-interface-design/) | Estados vazios podem explicar a situação e levar à primeira tarefa relevante. | Trocar relatórios vazios e contadores zerados por uma orientação com ação direta. |
| [NN/g — crianças](https://www.nngroup.com/articles/childrens-websites-usability-issues/) e [adolescentes](https://www.nngroup.com/articles/usability-of-websites-for-teenagers/) | As pesquisas mostram diferenças de expectativas entre idades e dificuldades com excesso de texto e apresentações inadequadas ao público. | Testar linguagem, densidade e aparência nas três faixas; não presumir que uma única estética agrada a todas. |
| [W3C — tornar cada etapa clara](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p04-clear-steps/) | Orientação cognitiva suplementar recomenda indicar localização, etapa atual e passos pendentes. | Cadastro curto com progresso explícito, identidade visível e retomada que informa onde continuar. |
| [EEF — participação familiar](https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/parental-engagement) | A síntese destaca apoio prático e comunicação ligada à aprendizagem; aponta menos evidências no ensino secundário. | Oferecer sugestões concretas e adaptar o acompanhamento conforme a autonomia. Não prometer ganhos de aprendizagem apenas por redesenhar o painel. |

A referência visual do Brilliant é útil, mas a arquitetura do Missão Saber precisa atender também crianças menores, famílias brasileiras, aparelhos compartilhados e preparação para olimpíadas. Nesta etapa foram consultadas fontes públicas; não se afirma uma nova auditoria de toda a área autenticada do Brilliant. A orientação W3C citada é suplementar, não uma certificação de conformidade WCAG.

## 4. Arquitetura da experiência

### Dois espaços, com contexto sempre visível

**Área do responsável:** acompanhar, apoiar, organizar e administrar. Cabeçalho “Área do responsável”; linguagem direta; nome do estudante acompanhado nas páginas de detalhe.

**Área de estudo:** aprender, experimentar, retomar e registrar. Cabeçalho com apelido do estudante, ano/trilha onde relevante e acesso nomeado à troca de contexto. Ocultar a administração desse espaço não substitui a autorização no servidor.

| Situação de entrada | Destino e ação principal |
| --- | --- |
| Visitante | Entender a proposta e experimentar uma missão; entradas identificadas para responsável e estudante. |
| Responsável com conta nova, sem perfil | “Vamos preparar o primeiro estudo” → criar perfil. |
| Responsável com perfil criado, ainda sem estudo | “Tudo pronto para começar” → abrir estudo daquele estudante. |
| Responsável que retorna para acompanhar | Resumo da família → acompanhar um estudante ou ler a orientação mais relevante. |
| Dispositivo autorizado para um estudante | Hoje daquele estudante → retomar ou iniciar a atividade recomendada. |
| Aparelho familiar sem contexto de estudo definido | Escolher o estudante autorizado; o adulto pode acessar seu espaço por confirmação. |
| Contexto expirado ou dispositivo não autorizado | Explicar como pedir a conexão ao responsável, preservando o destino pretendido. |

Não repetir uma tela “Quem é você?” em toda visita. A escolha explícita resolve o primeiro acesso e as trocas; o contexto autorizado resolve os retornos. Em equipamento público, disponibilizar saída clara e não lembrar acesso sem intenção do responsável.

### Navegação sugerida

| Público | Navegação principal | Conteúdo secundário |
| --- | --- | --- |
| Responsável | **Visão geral · Estudantes · Acompanhamento · Conta** | Rotina e perfil dentro de Estudantes; relatórios e orientações em Acompanhamento; assinatura, dispositivos, exportação e privacidade em Conta. |
| Estudante | **Hoje · Minha trilha · Laboratório · Caderno** | Revisões e simulados em Minha trilha, com chamadas em Hoje quando oportuno; histórico como “Minha atividade” dentro da trilha; preferências no menu do perfil. |

“Meu espaço” deixa de funcionar como uma categoria genérica. As funcionalidades atuais continuam acessíveis por rótulos concretos. Revisão não pode ficar escondida: além da recomendação em Hoje, Minha trilha precisa ter acesso direto e nomeado a “Revisar”. Validar os agrupamentos em teste de localização antes de fixar a navegação. Os quatro itens são uma proposta de hierarquia, não uma regra baseada apenas em quantidade.

Manter URLs antigas funcionando por redirecionamento, inclusive links de retomada do laboratório, relatórios e e-mails. Troca de perfil deve preservar os rascunhos do perfil de origem e limpar o contexto visual antes de carregar o seguinte.

## 5. Primeiro acesso e passagem para o estudante

O cadastro da conta do responsável e a confirmação de e-mail continuam separados da preparação do perfil. Não apresentar toda a administração da família como tela de boas-vindas.

1. **Quem vai estudar?** Apelido e ano escolar, consentimento claro. Avatar e mês de nascimento ficam opcionais e podem ser configurados depois. Indicar etapas e conservar o que foi preenchido ao voltar ou corrigir um erro.
2. **Por onde começar?** Sugerir uma trilha elegível e explicar em linguagem simples o que ela trabalha. Exemplo ilustrativo: “OLITEF · Nível 1 — situações com frações, porcentagens e decisões financeiras, para os anos atendidos por esta trilha”. Permitir comparar as demais. Um interesse declarado, como “quero treinar para uma olimpíada”, pode ajudar a escolher; não inventar um curso de reforço geral inexistente no catálogo.
3. **Tudo pronto para Lua.** Mostrar o que acontecerá no primeiro estudo. Ações: “Começar estudo com Lua” e “Ir para meu painel”. Ao abrir estudo: “Agora é a vez de Lua. Você pode ajudar na leitura; as respostas são dela.”

A terceira tela é uma confirmação de passagem, sem novos campos obrigatórios. Rotina, desafio familiar, e-mail semanal e assinatura ficam disponíveis depois. Consentimentos e informação essencial sobre uso de dados continuam claros no momento correto; simplificar a experiência não significa suprimi-los.

**Primeira experiência de estudo:** levar a uma missão inicial adequada, com orientação curta junto ao primeiro controle usado. Explicar “Você pode tentar, pedir uma pista e conferir sua ideia”. Se houver uma demonstração resolvida, identificá-la como prática guiada e não registrá-la como evidência independente.

**Diagnóstico:** oferecer “Já estudou esse assunto? Descubra por onde começar” como opção explicada. Não obrigar a concluir um diagnóstico para obter a primeira experiência, nem apresentar dois inícios sem explicar a diferença. Para quem escolhe o diagnóstico, o resultado precisa terminar em uma missão específica, com justificativa simples.

## 6. O dia do estudante

A página Hoje deve responder, nesta ordem: **quem está estudando; o que fazer agora; por que essa atividade; o que acontece depois**.

O motor existente continua responsável por disponibilidade e decisão pedagógica. Uma camada de apresentação traduz o resultado para a interface, sem implementar outra recomendação divergente em cada página.

| Estado | Mensagem ilustrativa | Ação principal |
| --- | --- | --- |
| Primeiro estudo | “Vamos descobrir como uma metade pode aparecer de jeitos diferentes.” | Começar minha primeira missão |
| Missão pausada | “Você parou na questão 3 de 6. Suas respostas estão guardadas.” | Continuar missão |
| Revisão indicada | “Vamos usar essa ideia em uma situação diferente.” | Revisar esta ideia |
| Próxima missão disponível | Título concreto, objetivo breve e motivo da indicação. | Começar missão |
| Investigação do laboratório em andamento | Explicar o vínculo e oferecer sua retomada; não substituir automaticamente uma missão pausada. | Retomar investigação, quando esse for o contexto de entrada |
| Estudo do dia concluído | “Seu estudo de hoje está guardado.” | Encerrar por hoje |
| Sem próxima missão elegível | Explicar se concluiu o conteúdo disponível, se há revisão futura ou se depende do plano. | Ação honesta para aquele caso, sem lançar sessão indisponível |

As prioridades de retomada e revisão devem respeitar a lógica atual e a origem do acesso. Entrar por um link de investigação precisa abrir essa investigação, sem forçar retorno à página Hoje. “Encerrar por hoje” não cria bloqueio de estudo: quem desejar pode escolher continuar.

### Laboratório, trilha e caderno dentro do percurso

- **Missão:** “Vou resolver uma situação.”
- **Laboratório:** “Vou mexer em uma representação para entender a ideia.”
- **Revisão:** “Vou recuperar uma ideia que já encontrei.”
- **Caderno:** “Vou guardar como pensei.”
- **Trilha:** “Vou ver o caminho e escolher outro assunto permitido.”

O laboratório ganha uma entrada contextual, como “Quer visualizar esta ideia?”, abrindo a ferramenta e o modo adequados ao assunto e ao ano. A biblioteca completa permanece disponível para exploração. Uma saída clara devolve à missão de origem. Não exigir laboratório e caderno em toda sessão: isso criaria passos obrigatórios sem necessidade pedagógica.

### Fechamento

Resumo curto com uma descoberta concreta e confirmação real de salvamento. “Encerrar por hoje” oferece uma conclusão tranquila; “Continuar aprendendo” fica como opção. Se uma reflexão for proposta, ela pode ser adiada. Não depender de porcentagem de acerto ou sequência diária para reconhecer o esforço.

### Texto e ajuda

Usar consistentemente “missão”, “trilha”, “laboratório” e “revisão”. Reservar metáforas para dar personalidade, sem trocar o nome da mesma ação entre telas. Exemplo: o botão de lançamento passa de “Começar descoberta” para “Começar missão”; a descoberta continua sendo aquilo que o aluno entendeu.

Explicações técnicas como “estratégias distintas com primeiro acerto sem pistas” pertencem ao detalhamento da evidência, especialmente no acompanhamento. Na ação diária: “Você já conseguiu resolver sozinho em situações diferentes”. Só mostrar essa frase quando os dados sustentarem a afirmação.

## 7. A experiência do responsável

### Visão geral com uma tarefa clara

Em vez de abrir todos os relatórios, apresentar um resumo por estudante: atividade recente, assunto trabalhado, próximo passo e acesso a “Ver acompanhamento”. No primeiro uso, substituir métricas vazias por “O acompanhamento começa depois da primeira missão” e “Abrir estudo de Lua”.

Para quem está apenas preparando o aparelho, disponibilizar “Abrir estudo”. Para quem veio acompanhar, a ação principal é ler a orientação do estudante selecionado. Não colocar dois botões com o mesmo peso em todos os cartões.

### Acompanhamento em três perguntas

1. **O que está aprendendo?** Assunto e um exemplo legível da estratégia.
2. **O que já observamos?** Separar prática, ajuda usada e evidência de autonomia; reconhecer quando ainda não há dados suficientes.
3. **Como posso apoiar?** Uma pergunta para conversar ou uma atividade breve com material comum, relacionada ao que foi estudado.

Exemplo de composição, com dados fictícios: “Lua praticou frações. Conseguiu comparar partes em duas situações; ainda estamos observando outras estratégias. Para conversar: como você explicaria por que duas partes podem representar a mesma quantidade?” A implementação precisa compor as frases a partir das evidências reais e das orientações revisadas existentes; não inferir domínio de uma contagem isolada.

Tabelas, tentativas e metodologia ficam em “Ver detalhes”. Isso preserva transparência sem exigir leitura técnica na abertura. Apoio sugerido antes de haver tentativas deve ser identificado como sugestão inicial da trilha, não como diagnóstico personalizado.

### Organização e autonomia

- Rotina apresentada como combinado, sem dívida ou punição por ausência.
- Configuração atual é familiar; rotina por estudante seria evolução de dados e produto, não apenas mudança de tela. Adotar somente se a validação indicar necessidade.
- E-mail semanal continua opcional, configurado pelo responsável, com acesso direto ao acompanhamento relevante.
- Assinatura, pagamentos, exclusão e exportação ficam em Conta, fora do percurso de estudo.
- Estudante deve entender o que é compartilhado com o responsável. Para adolescentes, privilegiar conversa, metas combinadas e resumo de aprendizagem; revisar explicitamente a visibilidade de reflexões antes de prometer privacidade que o produto não oferece.
- Não acrescentar comparação entre irmãos, rastreamento oculto ou notificações de cobrança direcionadas à criança.

## 8. Faixas escolares e direção visual

O catálogo atual começa no **2º ano**. A proposta mantém a separação pedagógica por ano escolar e organiza a apresentação em três faixas iniciais para validação. Ano não é uma medida perfeita de leitura, maturidade ou necessidade de apoio: leitura em voz alta, redução de movimento e ajuda devem continuar disponíveis a todos.

| Faixa | Apresentação sugerida | Autonomia e apoio |
| --- | --- | --- |
| 2º–5º ano | Instrução curta, uma ação por vez, exemplos visuais, alvos confortáveis de toque, personagem em momentos úteis. | Passagem do aparelho acompanhada; apoio de leitura fácil de encontrar. |
| 6º–9º ano | Linguagem direta, menos elementos decorativos, progresso com exemplos, escolha de alternativa à recomendação. | Mais exploração independente, explicação de por que a atividade foi indicada. |
| Ensino médio | Composição mais sóbria, objetivos e conteúdos em evidência, desafios descritos com precisão. | Planejamento próprio dentro do conteúdo elegível, histórico e preparação para provas acessíveis. |

As três faixas compartilham componentes e estrutura. Evitar três aplicativos distintos ou retirar ferramentas de acessibilidade de quem é mais velho. Preferência por menos animação ou personagem pode ser configurável, sem exigir data de nascimento completa.

**Domínio que deve aparecer no desenho:** tentativa, estratégia, partes e relações, trilha, investigação, registro e conversa em família. A interface precisa comunicar aprendizagem em andamento, não apenas uma coleção de cartões de desempenho.

**Cores e materiais:** manter o verde da marca para a ação principal; papel claro para leitura; grafite para texto; azul de representações e investigação; âmbar para orientação; violeta como acento discreto quando necessário. Contraste precisa ser medido na implementação; cores não podem ser o único sinal de estado.

**Elemento característico:** uma sequência reconhecível entre “o que vou investigar”, representação da ideia e “o que entendi”, reaproveitada na missão, laboratório e resumo familiar. Essa continuidade dá identidade ao produto e ajuda a família a reconhecer o que foi aprendido.

**Três padrões a substituir:** painel inicial dominado por métricas zeradas → orientação da primeira tarefa; mesma apresentação lúdica para todos → intensidade visual adequada ao contexto; grade de destinos com igual relevância → atividade principal e exploração secundária. Na área do responsável, usar mais espaço para leitura e menos decoração; no estudante, fazer a própria matemática ocupar o destaque visual.

## 9. Papéis e acesso: requisito funcional

Hoje existe a conta do responsável com perfis subordinados. O cookie de perfil seleciona o estudante, mas não cria uma identidade de aluno com permissões próprias. A confirmação recente protege determinadas operações; não equivale a entrar e sair de uma área adulta.

| Operação | Contexto de estudante | Contexto de responsável |
| --- | --- | --- |
| Responder, revisar, investigar e registrar | Somente no perfil autorizado | Ao entrar explicitamente no estudo daquele perfil |
| Ver o próprio percurso | Sim | Sim, pelo acompanhamento |
| Acessar outro estudante da família | Somente conforme autorização daquele aparelho; troca explícita | Sim, dentro da própria família |
| Alterar perfil, rotina e comunicações | Não | Sim |
| Assinatura, exportação e exclusão | Não | Sim; operações sensíveis mantêm confirmação adequada |
| Vincular ou revogar aparelho de estudo | Não | Sim |

**Primeira entrega:** sessão de estudo com escopo de perfil validado em todas as leituras e ações do servidor. Entrar em estudo no aparelho do adulto deve exigir novo desbloqueio para recuperar os privilégios do responsável; não basta ocultar botões enquanto a autorização anterior continua válida. A escolha “sou responsável” é intenção, não prova de identidade. Alterar cookie, URL ou requisição não pode ampliar o escopo.

**Evolução para aparelho próprio:** responsável autoriza conexão por código ou QR temporário, de uso único, com limite de tentativas, expiração e revogação. Não depender de compartilhar a senha do titular, nem de expor nomes de crianças em uma página pública. Permitir rever aparelhos conectados. Em aparelho compartilhado entre irmãos, o responsável escolhe quais perfis ficam acessíveis; evitar troca silenciosa e escrita no perfil errado.

Detalhar antes de implementar: validade e recuperação de sessão, comportamento entre abas, proteção contra requisições forjadas, revogação, confirmação para operações sensíveis e preservação de rascunhos. PIN simples pode ser avaliado como conveniência local, mas não deve ser tratado como prova suficiente de titularidade da conta. Não há, nesta análise, demonstração de acesso entre famílias; o achado é a ausência de separação de papéis dentro da sessão familiar.

A conta Informach também atende outros aplicativos. A implementação deve preservar o acesso do titular ao Cozya e à Agenda da Turma e definir o escopo de estudo dentro do Missão Saber, com revisão explícita das integrações de autenticação. Preferências pessoais do estudante, como tema e leitura, podem continuar disponíveis; alterações administrativas do perfil e concessão de acesso pertencem ao responsável.

## 10. Estados que precisam fazer parte do desenho

| Estado | Comportamento esperado |
| --- | --- |
| Sem perfil | A única tarefa inicial é preparar o estudo; não mostrar relatórios vazios como conteúdo principal. |
| Sem tentativas | Explicar quando o acompanhamento aparecerá e oferecer o primeiro estudo. |
| Perfil/curso fora do ano elegível | Explicar a adequação escolar e oferecer somente alternativas válidas. |
| Pausa, troca de estudante ou saída | Informar o que foi salvo; não misturar rascunhos nem evidências de pessoas diferentes. |
| Rede instável | Indicar tentativa pendente e permitir nova tentativa; não declarar “salvo” antes da confirmação. Não prometer modo offline completo sem implementá-lo. |
| Sessão expirada | Recuperar o acesso e voltar à tarefa quando possível, sem abrir a área administrativa para o estudante. |
| Conteúdo depende do plano | No estudo, mensagem neutra e caminho para pedir apoio ao responsável; contratação apenas no espaço adulto. |
| Conteúdo disponível concluído | Reconhecer a conclusão e sugerir revisão, laboratório ou outra trilha elegível; evitar uma tela sem saída. |
| Nenhuma revisão indicada | Explicar que não há revisão naquele momento e levar à missão disponível. |
| Retorno após ausência | Acolher e retomar, sem zerar conquistas como punição ou sugerir dívida. |
| Confirmação adulta cancelada | Manter estudante em seu contexto e permitir continuar o estudo. |

Acessibilidade entra em cada fluxo: teclado e foco visível, anúncio de erros e salvamento, títulos úteis, ordem de leitura, contraste, ampliação de texto, alvos de toque, redução de movimento e retorno de foco após diálogos. Realizar avaliação WCAG 2.2 AA durante a implementação; este documento não certifica conformidade.

## 11. Implementação em fases

| Fase | Entrega concreta | Verificação para encerrar a fase |
| --- | --- | --- |
| 0 — Validar a direção | Protótipo de entrada, preparação do perfil, passagem para estudo, Hoje e painel familiar; validar agrupamentos da navegação. | Famílias e estudantes localizam suas tarefas e explicam os espaços; registrar e corrigir dúvidas recorrentes. |
| 1 — Entrada e papéis | Estruturas de página separadas, contexto explícito, escopo de estudante no servidor, desbloqueio adulto, cadastro orientado e retorno ao destino pretendido. | Revisão de permissões e testes de aparelho compartilhado, links diretos, troca de perfil, expiração e retomada. Entregar o fluxo completo. |
| 2 — Rotina de estudo | Estados de Hoje, linguagem consistente, ajuda contextual, conexão missão/laboratório/caderno, fechamento do dia e navegação revisada. | Percursos nas três faixas e planos; manter regras de evidência, respostas, pistas, retomada e acesso escolar. |
| 3 — Acompanhamento familiar | Visão geral, detalhes por estudante, apoio acionável, configurações separadas e e-mail contextualizado. | Relatórios conferidos contra os dados; nenhuma afirmação de domínio sem suporte; testes com zero, um e vários estudantes. |
| 4 — Autonomia e acabamento | Conexão de dispositivo próprio, revogação, apresentação por faixa, preferências e ajustes de acessibilidade. | Testes de uso por adolescentes e famílias, segurança do vínculo, navegadores móveis e acessibilidade. |
| 5 — Piloto e lançamento | Instrumentação, exposição gradual, correções finais e migração dos acessos antigos. | Revisão completa, resultados do piloto, verificações de produção e possibilidade de voltar à versão anterior sem perder dados. |

Adaptar linguagem essencial de cada faixa já nas fases 1–3; a fase 4 aprofunda a apresentação e a autonomia, não adia o acesso de adolescentes. O modo restrito no aparelho compartilhado é parte da fase 1; o vínculo de outro aparelho é uma capacidade adicional da fase 4.

Depois de cada fase: revisar funcionalidade, conteúdo das mensagens, autorização, acesso por ano, experiência móvel e acessibilidade; corrigir os achados antes de ampliar o escopo. Manter o banco pedagógico e os identificadores de atividades, evitando uma reescrita do motor de aprendizagem. Estimar esforço após especificar o modelo de sessão; essa é a parte tecnicamente mais importante e incerta da proposta.

## 12. Validação e critérios de sucesso

### Pesquisa com famílias

Primeira rodada qualitativa sugerida: 5–8 responsáveis e 4–6 estudantes em cada faixa, incluindo uso compartilhado, adolescente com aparelho próprio, diferentes familiaridades digitais e necessidades de leitura. É uma amostra para encontrar problemas, não para estimar percentuais da população. Obter consentimento do responsável e concordância do estudante; usar dados fictícios e tarefas adequadas.

Tarefas sem instruir o caminho: criar o primeiro perfil, colocar a criança para estudar, encontrar a próxima atividade, voltar após uma pausa, usar o laboratório como apoio, localizar uma orientação familiar, trocar de estudante e encerrar a sessão. Perguntar “quem está usando esta tela?” e “o que você faria agora?”. Registrar sucesso sem ajuda, hesitações, caminhos errados e compreensão do que foi salvo ou compartilhado.

Objetivos iniciais de desenho, a validar: reconhecer papel e próxima ação em aproximadamente dez segundos; abrir a atividade indicada em uma ação a partir de Hoje; acompanhar um estudante e encontrar uma sugestão de apoio sem ler o relatório inteiro. Não prometer uma taxa de sucesso ou ganho de aprendizagem antes de estabelecer a linha de base.

### Métricas de produto

- Conversão entre conta confirmada, perfil criado, atividade aberta e primeira tentativa significativa; medir as etapas separadamente.
- Tempo e erros para chegar à primeira atividade, segmentados por contexto e faixa escolar.
- Retomadas bem-sucedidas de missão e investigação, incluindo casos de rede instável.
- Localização e compreensão de apoio familiar; cliques são somente um indício, não prova de que a orientação ajudou.
- Uso consistente ao longo das semanas e compreensão pedagógica avaliados separadamente. Tempo de tela, volume de cliques e pedidos de pista não são, isoladamente, sucesso ou fracasso de aprendizagem.

Eventos devem registrar etapas e identificadores técnicos necessários, sem copiar respostas abertas, apelidos, e-mails ou textos de reflexões para a telemetria. Definir finalidade, acesso, retenção e configuração de privacidade antes de instrumentar. Obter a linha de base do fluxo atual e avaliar mudanças por grupo; não atribuir diferenças à interface sem considerar plano, conteúdo, ano escolar e experiência prévia.

### Critérios de aceite funcional

- O estudante não acessa dados ou ações adultas modificando URL, cookie ou requisição.
- Cada estado inicial tem um destino e uma ação principal coerentes; o responsável reconhece seu espaço visualmente.
- Missões, investigações e registros continuam associados ao perfil correto depois de trocar contexto, recarregar ou retomar.
- Revisões e simulados continuam encontráveis; links antigos mantêm seu destino autorizado.
- O primeiro uso não exige compra, escolha sem explicação de olimpíada ou conclusão obrigatória de diagnóstico.
- Relatos distinguem sugestão inicial, atividade realizada e evidência de autonomia.
- Faixa escolar e disponibilidade de conteúdo são respeitadas em todas as entradas.
- Mensagens de salvamento, duração, conclusão e progresso correspondem ao que o sistema sabe.
- Navegação e fluxos principais funcionam em celular, teclado, ampliação e leitor de tela.

## 13. Decisão recomendada

Aprovar a direção de **dois espaços explícitos e um percurso diário orientado**, começando pela entrada e pela passagem entre responsável e estudante. Validar o conceito com famílias antes de consolidar nomes e apresentação. O maior ganho esperado é reduzir a necessidade de entender a estrutura do aplicativo para conseguir estudar ou acompanhar; a hipótese precisa ser medida no piloto.

Não há necessidade de ampliar novamente o catálogo para resolver esse problema. O produto já tem material, orientação pedagógica e ferramentas suficientes para sustentar uma experiência inicial muito mais clara. A próxima evolução deve organizar essas capacidades em torno das tarefas de cada pessoa.
