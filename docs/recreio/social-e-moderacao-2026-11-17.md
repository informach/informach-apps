# Recreio: social e moderação

**Objetivo:** implementar F4 da plataforma sem depender de D3–D8 do Morada.
Este é o plano da próxima frente; não registra entrega ou ativação.

**Arquitetura:** domínio puro em `packages/recreio/src/dominio/social.ts`,
persistência no schema `recreio` e módulos `features/social` e
`features/moderacao` do portal. O jogo consome contratos do SDK e não recebe
conta, e-mail, nascimento, banco ou credenciais de operação. Amizade não concede
responsabilidade infantil, administração comercial ou permissão de mundo.

**Tecnologias:** versões vigentes do lockfile; Next/React, Drizzle/PostgreSQL,
Better Auth, SDK próprio. Nenhum serviço ou pacote novo como pressuposto.

**Especificação:** `artes-3d/paginas/recreio.html` v2.2, seções Social,
Proteção e Marcos. Decisões do titular em
[fechamento da plataforma](fechamento-plataforma-2026-11-16.md).

## Fronteiras e decisões

- Sem busca pública de menores, chat livre, áudio ou vídeo. Contato começa por
  código; nenhuma URL pública revela perfil, e-mail, idade ou presença.
- Reutilizar `jogadorDoAparelho` e a admissão básica
  `admitirAparelhoAtual`: identidade atual é distinta de concessão de gameplay.
  A gestão social não deve iniciar teste, consumir tempo ou exigir partida
  aberta para bloquear/denunciar. Abertura de jogo continua no kernel completo.
- Recalcular política infantil e conferir gerações, responsabilidade, sessão,
  prazos e contexto após esperas. Recusa que recalculou a política precisa
  confirmar sua revogação, como o kernel atual faz.
- Descobrir as duas pontas como pistas, ordenar contas/mutexes e perfis antes
  das travas. Incluir responsáveis de menores. Divergência exige nova admissão
  após rollback; não tomar um mutex recém-descoberto segurando os anteriores.
- Menor até 12 exige aprovação do responsável atual para amizade. Adolescente
  recebe apenas por código, com aviso ao responsável. Contato e presença
  continuam sujeitos à supervisão; fazer 18 não converte perfil protegido.
- Bloqueio/silêncio são ações do perfil, inclusive para quem perdeu cobertura.
  Não transferem conteúdo nem apagam participações ou dados de terceiros.
  Código copiado não pode contornar bloqueio, aprovação ou política atual.
- Presença pública não revela nome/referência do mundo, moradores, relações ou
  rotina. Perfil invisível não aparece por inferência em listas/convites.
- Moderação usa ações fechadas e auditadas no Recreio. Bastidores conserva
  2FA, leitura por conexão read-only e nenhum acesso ao conteúdo das famílias.
  Não criar SQL de escrita genérico, impersonação ou cópia do mundo no console.
- Evidência de denúncia é mínima e estruturada. Definir a política de retenção,
  finalidade, prioridade infantil, expurgo e recurso antes de habilitar a fila;
  não guardar conteúdo ou textos livres por conveniência operacional.
- Nenhuma alteração desta frente classifica o Morada nem habilita famílias,
  venda ou comunicação com desconhecidos.

## 1. Amizades e proteção do contato

Primeira candidata: regras puras de contato, aprovação por geração e presença,
mais schema aditivo. Código de uso único dura até 30 minutos; só o hash fica
persistido. Quem perdeu a resposta pode gerar outro código, encerrando o anterior;
não reconstruir o segredo por identidade ou guardar seu texto em logs. Pedido
criado por código dura até 72 horas e conserva aceite explícito do destinatário.
Novo código não desfaz pedido já recebido; bloqueio/recusa/cancelamento o fazem.

Tabelas: `friend_codes`, `friend_requests`, `friend_consents`, `friendships`,
`social_blocks`, `social_preferences` e `social_notices`. Uma amizade não tem
direção, e os perfis ficam ordenados na chave. Um único pedido pendente por par
evita aceites cruzados; código admite um só pedido e a chave de repetição é do
perfil remetente. Consentimento conserva vínculo/geração e quem aprovou, mas
exclusão do antigo aprovador retira essa identidade sem bloquear o encerramento
por um recibo técnico antigo. Aprovação ausente ou antiga nunca concede contato.

Bloqueio é durável até retirada explícita, não uma credencial com TTL. Avisos
do responsável não guardam conteúdo. Limpeza de recibos não pode apagar um
pedido aceito que ainda fundamenta amizade/aprovações ativas. A presença adulta
optada como online pode ser mostrada a participante atual do mesmo mundo;
modo amigos e perfis protegidos exigem amizade aprovada atual. Nenhum resultado
de presença contém mundo, rotina, bairro ou relações do jogo.

A fonte de grupos/guarda `204cf79c` fica congelada para qualificação e publicação
limitada. A guarda sem migration é `644b3841`, sobre a base pública atual. Esta
frente social é posterior e não entra em nenhuma dessas duas publicações.
Schema, regras e provas sociais ainda não foram qualificados nem ativados.

0184 gerada em `44119717750`, fonte `bd2eb850`, artefato `14343674077`;
ZIP SHA `a861c784991a1ac7e738a19526f25112b42630742a5dc69b489fd6a03730c5eb`.
`0184_nappy_killmonger.sql`, 13.795 bytes, SHA
`48280715c3666d521cab5c8ca8915589fb3f29a48b82a3deee55bf20f53aae1a`;
snapshot SHA `a7f65d27a3586c822736cee3bb8ba81ba23f50092e98bd8051f20d5e4a6958a2`;
journal SHA `4ee5fc27bb2d9d7d106787d2f257bd4642f3f936aeec7b277af6cd5bb914eb13`.
Três arquivos conferidos e copiados intactos. Somente sete tabelas novas e
suas constraints/índices; nenhuma alteração ou carga de dados anteriores.

A admissão candidata toma todos os mutexes de contas antes de perfis e aparelho,
conserva os contextos nativo/pareado e revalida os dois perfis e prazos. Política
recalculada confirma a invalidação mesmo quando recusa a interação. Proteção
contra um alvo suspenso tem caminho próprio, sem exigir que ele esteja disponível
para novos contatos. Não há token de jogo aceito por esse adapter de cookies,
nem concessão financeira ou criação de sessão. A integração futura do SDK
continuará validando seu SID no kernel e não converterá Bearer em cookie.

Provas candidatas: dois adultos sem cobertura, pareado/geração revogada, perfil
forjado, prazo perdido durante a operação, supervisão recalculada, proteção
contra perfil suspenso, pedidos recíprocos e integridade das tabelas. Nenhuma
rota social ou fluxo foi ativado por esta fundação; escritores/interfaces e
moderação continuam pendentes.

A fonte `72b8bf8e` passou em integração, navegador, versões, checkpoint,
cliente e longa (`44121930438`). Qualidade parou em uma diferença de formatação
do teste de schema; corrigir e conferir novamente sem escrita, sem ignorar o
gate ou alterar estilos de outros produtos. Regras puras ainda precisam do
gate de qualidade completo.

Próxima candidata implementa emissão e pedidos: código com 12 caracteres
base32, gerado por `crypto.randomInt` sem viés modular
([API do Node 24](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandomintmin-max-callback)),
uso único e hash com finalidade própria; até seis emissões/hora por perfil.
Pedido exige chave UUID própria, comparação do corpo normalizado e leitura da
identidade antes de descobrir o destino. A transação seguinte admite as duas
pontas desde o início, valida bloqueios/código, cotas (20 pedidos pendentes e
100 amizades por perfil) e retira o código de uso. Avisos ficam somente dentro
da conta; nenhum e-mail é enviado por esta implementação.

Repetição devolve recibo sem ampliar prazo, criar amizade ou reativar relação.
Pedido cruzado pendente exige aceite explícito na entrada recebida, sem aceite
implícito pelo código. Código perdido pode ser reemitido; não há repetição
automática de mutação com resposta perdida. Auditoria, consumo e avisos são
atômicos. Provas cobrem uso/repetição, normalização, revogação, bloqueio nas duas
pontas, aviso infantil/adolescente, última cota concorrente e falha/prazo na
auditoria. Aceite, aprovação, proteção, leitores, interfaces e moderação seguem
pendentes; ainda não há superfície social habilitada.

- [ ] Mapear a política efetiva, admissão básica, supervisão e escritores de
  composição antes de adicionar autoridade social. Registrar ordem global de
  mutexes, perfis, aparelho, par de contato e auditoria.
- [ ] Definir contratos de código próprio rotativo e pedidos por par de
  perfis: emissão, revogação, prazo, limites e resposta que não enumera contas.
  Persistir somente resumo criptográfico de códigos; nunca código na auditoria.
- [ ] Modelar pedidos, amizades, aprovações atuais e bloqueio/silêncio com
  constraints e índices. Aprovação não sobrevive à troca de responsável/geração.
  Gerar migrations/snapshots no GitHub e conferir todos os hashes.
- [ ] Implementar pedir, aceitar, recusar, cancelar, remover contato, bloquear,
  desbloquear e silenciar, com revisão/recibo idempotente e auditoria atômica.
  Novo aceite após remoção exige novo pedido e autorização atual.
- [ ] Implementar aprovação/recusa do responsável nativo, com login recente,
  consulta mínima e aviso persistido que não revela conteúdo do jogo.
- [ ] Provar no PostgreSQL: outro perfil/aparelho, código vencido/revogado,
  bloqueio em qualquer ponta, pedidos cruzados/duplicados, última cota,
  aprovação antiga, troca de responsável, aniversário e rollback da auditoria.

## 2. Presença e integração com convites

- [ ] Implementar preferências próprias e projeção privada de presença,
  revalidando amizade/aprovação/bloqueio na leitura. Ausência ou falha não pode
  virar divulgação de presença ou revelar mundo aberto.
- [ ] Reutilizar o ciclo de sessão para presença com prazo; heartbeat não
  cria sessão ou prolonga acesso, e reconexão não cria presença duplicada.
- [ ] Acrescentar destinatário e verificação social aos convites de mundo.
  O aceite relê ambas as pontas, política de conteúdo e permissão atual do
  emissor; amizade sozinha não cria membro nem concede entrada.
- [ ] Definir explicitamente o efeito de bloqueio sobre convites/visitas e
  mundos já compartilhados, preservando históricos e poderes do responsável.
  Não retirar de alguém a própria casa apenas porque outro membro bloqueou.
- [ ] Provar no HTTP/instância que copiar código, responder com revisão
  antiga ou aceitar antes de perder a amizade não contorna a proteção atual.

## 3. Denúncia e operação restrita

- [ ] Definir motivos fechados, correlação mínima, limites por perfil/aparelho,
  recibo e retenção. Excluir texto de mundo, bytes de progresso e dados fiscais.
- [ ] Implementar envio por perfil e consulta/ações por equipe autorizada com
  duas etapas e login recente. Fila infantil tem prioridade explícita.
- [ ] Implementar suspender/reativar perfil, desfazer amizade e invalidar
  convite com motivo fechado, revisão esperada e recibo. Efeito e auditoria
  estrita entram juntos; suspensão revoga sessões e capacidades anteriores.
- [ ] Expor no Bastidores somente a projeção operacional autorizada, sem
  consulta genérica de famílias. Provar papel indevido, 2FA ausente, sessão
  antiga, repetição, concorrência e falha da auditoria.
- [ ] Integrar limpeza delimitada com `SKIP LOCKED`, contagens e HTTP de falha.
  Não apagar a evidência de ação auditada ou reativar código ao limpar recibos.

## 4. SDK, telas e publicação

A candidata privada `8325e027` passou os sete gates do Recreio na execução
`44124446919`: emissão e consumo de códigos, pedidos, limites concorrentes,
autoridade atual e avisos internos. Isso ainda não habilita o recurso em produção.
O próximo incremento separa o aceite do destinatário da aprovação do responsável:
a aprovação vincula perfil, vínculo e geração atuais; revogar o acesso exige nova
aprovação. Os testes cobrem responsáveis sem perfil jogador, duas crianças,
adolescentes, login antigo, repetição após remoção e rollback por auditoria/prazo.

O incremento seguinte implementa recusa/revogação por ponta correta, remoção,
bloqueio e silêncio. Bloquear encerra o pedido pendente e remove a relação ativa
atomicamente; desbloquear ou retirar silêncio não refaz contato. A proteção
conserva sua direção e funciona contra alvo suspenso, sem exigir sua política
de contato. Novos registros exigem uma relação conhecida e têm teto por perfil.
Concorrência com aceite e falha estrita da auditoria são casos de integração no
PostgreSQL descartável. Telas, SDK, presença e moderação continuam pendentes.

A retenção candidata processa cem vencimentos e até quinhentas exclusões por
categoria com `SKIP LOCKED`. Código vencido e recibo terminal sem amizade ativa
saem após um dia; avisos e relações removidas têm teto de trinta dias. Aprovações
de amizades ativas e bloqueios/silêncio não entram nesse expurgo. Auditoria é
atômica e a manutenção devolve contagens; qualquer falha conserva HTTP de erro.
As provas cobrem trava concorrente, repetição, limite, consentimento infantil
preservado e reversão por falha na auditoria do vencimento ou da exclusão.

`ad89c06` passou nos sete gates `44128595223`; aceite infantil e aprovação
atual estão qualificados nessa fonte privada. O adapter de partida seguinte
mantém o kernel autoritativo, com uma entrada anterior à trava de identidade
para ordenar as duas pontas. Revalida SID, aparelho, login, cobertura, política
e prazo. Uma recusa por recálculo do destinatário conserva a revisão confirmada.
O caminho de cookie continua independente da cobrança; um SID encerrado não
vira uma identidade de cookie. HTTP/SDK e interface ainda serão ligados a esse
adapter depois dos testes negativos e concorrentes no GitHub.

A candidata HTTP/SDK seguinte negocia social explicitamente na abertura e o
mantém desligado por padrão. Só clientes que pediram a capacidade podem receber
o campo novo, preservando leitores estritos anteriores. A rota de mutação usa
Bearer atual, schema estrito e corpo de até 2 KiB. Desligar novos contatos ainda
permite recusar/revogar, remover e ajustar a própria proteção; não mantém um SID
encerrado. Testes com duas contas usam as rotas reais, código, recibo de repetição,
aceite e bloqueio; também cobrem autoridade inventada, corpo excessivo, falta de
token, resposta perdida sem repetição automática e handle encerrado após saída.

`52c73a1` passou nos sete gates `44131496917`: 636 integrações/64 arquivos,
incluindo sete provas da autoridade social de partida; atualização 179→185
preservou os dois perfis e seu progresso/conquistas e aceitou repetição.
Também há uma nova decisão explícita de reaprovação sobre amizade ainda ativa:
após revogar uma geração, o responsável atual precisa ler a versão do menor e
a revisão da relação e confirmar novamente. Repetir um aceite/aprovação antigo
não concede essa autorização. Relação removida nunca é reativada por esse caminho.

A primeira prova de revisão antiga em `68b3702` falhou porque subtrair um de
uma revisão inicial gerou zero, recusado pelo schema antes da comparação. A
correção da fixture altera a supervisão pelo serviço real, confirma o incremento
e envia a versão anterior ainda válida no schema. Não houve relaxamento da
validação nem aprovação dessa execução: `44133904635` contém a falha registrada.

O SDK negociado `0ededaa` passou nos sete gates `44133249684`. A próxima
candidata acrescenta listagem de dez relações conhecidas por página e preferência
de presença, sem busca pública. Consulta revalida perfil, vínculo/geração,
aprovação e bloqueio por par; não retorna contas, idade, local ou conteúdo de
mundo. Nomes protegidos ficam ocultos sem aprovação atual. Online exige amizade
autorizada, opção atual, contato de partida nos últimos noventa segundos e
autoridade atual do aparelho/login/cobertura; perda dessas condições informa
somente falso. Perfil protegido não configura presença com sua credencial.
A preferência final do observador é relida e contato desabilitado retira nomes
e disponibilidade do resultado. Bloqueio vazio de desconhecido também exige
relação conhecida, sem distinguir perfil existente. SDK e rotas reais entram
nas provas, além de paginação, supervisão, revogação e reaprovação.

`874140e` aprovou 652 integrações, incluindo as consultas novas; a execução
`44136944910` falhou em outra fixture porque arquivos distintos reutilizavam
`198.18.2.1` e atingiram o limite real de pareamento. O helper passa a representar
cada família por um IPv6 de documentação próprio, derivado de sua identidade.
Limites, contadores e regras de produção não são alterados ou desativados.

### Integridade entre registros sociais

A revisão da persistência encontrou referências simples que não amarravam a
composição: código ao destinatário, aprovação ao perfil do vínculo e amizade
ao par/pedido aceito. Os writers validam essas relações, mas a mesma composição
também precisa ser recusada pelo banco quando divergente. Antes da publicação
de F4, acrescentar chaves compostas e provas negativas no PostgreSQL.

1. Gerar uma migration somente com as chaves dos pais e a representação
   ordenada do par, calculada pelo banco; incluir as pontas do pedido em
   aprovações/avisos e atualizar seus únicos writers.
2. Gerar a migration seguinte com FKs compostas e checks, depois das chaves
   estarem no snapshot anterior. Amizade referencia exatamente o par aceito;
   gravar o aceite antes da relação na mesma transação.
3. Retenção deve retirar explicitamente referências técnicas de códigos e
   relações removidas antes de apagar recibos, sem nulificar perfil ou mexer
   na autoridade de amizades ativas. Lotes e auditoria continuam obrigatórios.
4. Provar destinatário errado, vínculo de outro menor, ponta fora do pedido,
   pedido pendente/recusado de outro par e expurgo concorrente. F4 nunca foi
   publicado: 0184 e os incrementos seguintes entram juntos sobre tabelas
   novas vazias, com inventário obrigatório; dados inesperados impedem a
   implantação até existir uma sequência de backfill revisada.

Sintaxe e restrições consultadas nas fontes primárias de
[Drizzle](https://orm.drizzle.team/docs/generated-columns) e
[PostgreSQL 18](https://www.postgresql.org/docs/18/sql-createtable.html).
As colunas calculadas precisam ser `STORED` no SQL gerado; a aplicação e os
testes no PostgreSQL descartável confirmam o contrato, sem atualizar versões.

0185 gerada em `44137952933`, fonte `d8775864`, artefato `14352054204`;
ZIP SHA `6f55c004417d00a4360b835bf3a439ae1fa7f816441d072de3df0533b34a7b08`.
`0185_flaky_cardiac.sql`, 1.588 bytes, SHA
`2bcbcf2945f0f1d1e0ffc583f55d6d331a05909fee4f2b896ce8544b95263dbd`;
snapshot SHA `91f2fa69dd158af4673348bc03c0bf43fc06e9e10255be706438ed49a2a45b55`;
journal SHA `51aed2f730b49c5706a27e03deafd757988cd571ff474af53c962ed0598e4c98`.
Três arquivos conferidos/copiados intactos. O SQL usa `STORED` e cria primeiro
as chaves dos pais. As quatro colunas obrigatórias de aprovações/avisos exigem
essas tabelas novas vazias; não aplicar sobre dados sociais existentes sem
sequência de backfill revisada. Nada dessa frente foi aplicado em produção.

0186 gerada em `44139207478`, fonte `794dc9de`, artefato `14354620195`;
ZIP SHA `f0c3ab93e822aeff144553d31932abef9366f9c7f17e3b81246e3da02a0bdfd9`.
`0186_polite_bedlam.sql`, 2.864 bytes, SHA
`2f63d67e1d270fc586f9ee493e0ac00ebea0a51ad08e1f11797911d008ead5d6`;
snapshot SHA `37f76800ec6fed03db9f1a7d127818485ca960c1029f862881f77f23e98ed028`;
journal SHA `39adeafe3f24d6cb3aa0dd2d10d10ea4e26136c08030f7680cbbd48358d90c41`.
Arquivos conferidos e copiados intactos. O SQL troca cinco FKs simples por
compostas e acrescenta três checks, depois das chaves de 0185. A limpeza retira
somente referências técnicas de códigos vencidos e relações removidas com lote
e `SKIP LOCKED`; referências ativas impedem a exclusão do recibo.

A redução de bloqueio/silêncio passa a exigir a fotografia anterior das duas
flags. Uma tela antiga não pode retirar bloqueio novo ao tentar reativar som.
Repetição sem mudança continua sem novo evento, e aumentar proteção não exige
uma concessão nova. Remoção sem qualquer relação também recusa desconhecidos
de forma uniforme. `f64f63d` passou nos sete gates `44140322404`, com 658
integrações/68 arquivos, quatro provas novas das FKs e atualização 179→187
preservando perfis/progresso/conquistas e repetição sem mudança. Nada publicado.

O incremento seguinte centraliza a autoridade social nativa do responsável e
acrescenta consulta, proteção, remoção e leitura explícita dos avisos de seus
menores, sem perfil jogador do adulto. Leitura exige identidade atual; mutação
também exige login recente. O ator da auditoria é o adulto que agiu. Credencial
pareada e conta de outro responsável não herdam esse poder. Proteção funciona
com contato desabilitado/alvo suspenso e não concede participação em mundo.
O responsável pode analisar a identificação adulta de um pedido que seu menor
ainda não aprovou; a identificação de outro perfil protegido continua exigindo
a aprovação atual do responsável daquele outro perfil.

A abertura de novos contatos passa a ser conferida nos serviços, para cookie,
SDK e gestão familiar. Só o executor descartável de testes habilita explicitamente
o modo; o padrão de produção permanece `off`. Desligar novos contatos preserva
consulta e proteção existentes. O próximo gate precisa confirmar a leitura sem
login recente, a recusa na escrita, ausência de jogador fictício, avisos e
rollback de proteção por prazo/auditoria. Telas ainda estão em implementação.

`ac71feb` foi recusado em `44143554694`: a auditoria da leitura de aviso
usava uma variável inexistente (`profileId` em vez de `perfilId`). Tipos/builds
e dois testes transacionais expuseram a mesma causa; 663 integrações passaram.
A correção explicita `profileId: perfilId`, sem suprimir o erro ou retirar a
prova de rollback. O resultado anterior permanece registrado como falha.

A candidata seguinte acrescenta `/amigos` para perfil próprio ou aparelho
pareado e contatos do menor na gestão nativa do responsável, inclusive sem
jogador. Ações conferem o perfil esperado contra o aparelho atual; a seleção
enviada pela tela não concede autoridade. Código fica apenas na tela após a
emissão; pedido preserva nonce por código, sem repetição automática. Aprovação
é uma escolha explícita separada do aceite. Presença infantil fica sob as
regras do responsável. Bloquear, silenciar, remover e ler avisos reconsultam o
servidor após confirmação; desbloquear nunca refaz amizade.

Dois novos percursos de navegador usam contas e pareamento reais no ambiente
descartável: adultos com silêncio/bloqueio/presença e responsável sem jogador
com criança, aprovação, aviso e recusa de gestão no aparelho infantil. Incluem
CSP, erros e capturas a 390 px. Ainda sem resultado remoto desta candidata;
denúncias/moderação, superfície no host e aceites seguintes continuam pendentes.

## 2. Denúncias estruturadas e ação restrita

Implementação em incrementos privados; a fila só será habilitada com operação
e aceites completos. Primeiro entram contrato fechado e tabela nova vazia.
Depois vêm writers com autoridade nativa/pareada/SID e do responsável atual,
interface/SDK, provas negativas e retenção. Por último, leitura operacional
no Bastidores e comandos fechados do Recreio, sempre após 2FA e conferência
da autoridade atual, sem sessão emprestada ou SQL genérico.

O primeiro alvo é um contato já conhecido por pedido, amizade ou proteção.
O servidor captura só a espécie do fato, referência opaca/revisão e prioridade;
não aceita evidência, texto livre, nome, mensagem, foto ou mundo do cliente.
Categorias: contato indesejado, assédio, conteúdo inadequado, dados pessoais,
ameaça ou outro. Até dez tentativas novas por perfil a cada dez minutos;
nonce próprio recupera exatamente o mesmo corpo e não amplia a retenção.
Proteção e denúncia continuam disponíveis sem cobertura ou novos contatos
habilitados. Denunciar não pune automaticamente nem dá acesso a dados do alvo.

Finalidade: analisar risco e registrar a decisão/recurso. Retenção máxima de
180 dias desde o recebimento e, depois de encerrada, no máximo 90 dias,
sempre respeitando o primeiro teto. Remoção de conta retira suas referências
pessoais conforme F7; nunca conserva conteúdo familiar. Expurgo é limitado,
auditado e registra quantas denúncias chegaram ao teto sem análise, causando
falha operacional que exige atendimento. Não classificar expiração como
denúncia resolvida. Menor em qualquer ponta ou ameaça tem prioridade; medir
idade da fila e comprovar alerta/atendimento antes da ativação.

Aceites: integridade negativa no PostgreSQL, identidade/parentesco forjados,
alvo desconhecido, repetição/corpo divergente, silêncio/bloqueio prévio,
rollback por auditoria e vencimento, leitura sem vazamento, expurgo com
SKIP LOCKED e alerta por pendência. Ações de moderação só sobre o alvo
explicitamente confirmado, com revisão, motivo fechado e recibo atômico.

0187 gerada em `44149942490`, fonte `f8b03211`, artefato `14356879917`;
ZIP SHA `a990649fcae39c3b26d7469f73507fe1319ec11706b925ae240babb367158852`.
`0187_yellow_giant_girl.sql`, 4.261 bytes, SHA
`83925e6eb2fa05490c910c8681cd64eacdcb8076f3cc5f193d2f43d91364b7df`;
snapshot SHA `d83101c5b4c509dcc3a1b2fb025b8aadc84b49cd7e9703402865d3af04583611`;
journal SHA `18cfeb9afa9e7bbfa05aa745b58d58784b8144414d7737aa597a40e9c9eb3ab5`.
Três arquivos conferidos e copiados intactos. Apenas tabela nova, FKs com
retirada de referências e checks/índices; nenhuma carga ou alteração anterior.
Ainda não aplicada em produção; F1 continua congelada em `204cf79c` sem F4.

Writers candidatos recebem denúncia do jogador ou do responsável atual, sem
cobertura e mesmo após bloquear/suspender o alvo. Recuperação compara corpo
e ator; teto de dez protocolos novos por dez minutos é serializado no perfil,
com limite adicional de trinta tentativas. Prioridade infantil/ameaça vem do
servidor. Treze provas PostgreSQL cobrem autoridade, repetição, auditoria,
prazo, integridade e retenção. Manutenção expurga até 500 com SKIP LOCKED;
fila prioritária acima de 24 horas ou demais acima de 72 horas mantém falha
operacional até atendimento. São tetos internos de alerta, não promessa pública
de atendimento. Interface, SDK, leitura/recurso e comandos da equipe ainda
precisam de implementação e prova antes de habilitar denúncias.

As telas `cfc74e8` passaram em seis gates de `44149199308`. Navegador teve
24 aprovações e uma recusa: o novo teste esperava `encerrada=1` para um aparelho
sem sessão adulta, mas o fluxo correto preserva `next` na entrada. A prova
conferiu a aprovação, o aviso e o bloqueio antes dessa divergência. `cc76fa6`
ajusta somente a expectativa e mantém a recusa da gestão; nova verificação
separada em andamento. Não anunciar as telas homologadas por esse resultado.

`3fdd38c` passou em integração `44151664745`: 678 testes/71 arquivos, incluindo
os treze de denúncias e retenção; atualização 179→188 conserva dois perfis,
bytes de progresso, conquistas e repetição. Os demais gates ainda estão sendo
acompanhados. A candidata seguinte liga denúncia ao cartão do contato e ao SDK,
com UUID conservado e protocolo exibido, sem reenvio automático ou punição
automática. Responsável e aparelho infantil percorrem o formulário real no
navegador; somente o responsável recebe o link externo de suporte. Capturas
sociais entram na lista explícita de artefatos sintéticos do workflow.

O gate de versões de `cc76fa6` expôs o prefetch do novo link `/amigos` durante
a parada proposital do servidor. O teste já separava, somente nesse intervalo,
conexões recusadas/resetadas de prefetch de `/conta` e `/perfis`. O novo destino
entra na mesma lista exata com `_rsc`; erros de ação e todos os erros fora da
troca continuam recusados. Não desabilitar prefetch, acrescentar retry ou
afrouxar a prova de criação única entre as builds.

Próximo incremento: seis comandos fechados (analisar, concluir, suspender ou
reativar perfil, desfazer amizade, invalidar convite), com protocolo, revisão
e UUID. O Bastidores mantém leitura restrita e autentica sua sessão com 2FA;
seu servidor emite prova de trinta segundos, tipo/audiência/emissor exclusivos,
vinculada ao hash do corpo e à sessão real. A chave é própria dessa ligação,
sem reutilizar chave do jogo, da instância ou do login. Recreio ainda confere
papel, 2FA, banimento, sessão, composição, revisão e prazo no banco antes e
depois da ação. Prova assinada não substitui autoridade atual.

Recibos ficam no Recreio com corpo resumido, ator real, operação e revisão;
repetir o mesmo comando não aplica novamente. Nunca armazenar a prova ou
credencial de sessão. A pessoa pode pedir uma revisão da decisão, sem texto
livre e sem ampliar a retenção original. Análise/decisão não apagam o protocolo
nem expõem a sanção de outra pessoa. A fila usa a data própria do recurso para
medir seu atraso; trinta dias após uma decisão sem novo recurso encerram o
caso, respeitando os tetos de retenção já definidos. Novas colunas são aditivas
e nullable; recibos exigem migration gerada e provas antes de qualquer uso.

A API de assinatura foi consultada na documentação primária de
[jose 6.2.12](https://github.com/panva/jose/blob/v6.2.12/docs/jwt/verify/functions/jwtVerify.md),
sem atualizar a biblioteca. Testes candidatos recusam corpo alterado, chave,
tipo, audiência, emissor e prazo divergentes. Comandos e recurso ainda não
estão implementados ou ativados por essa fundação.

`714807e` passou nos sete gates `44152709064`. As quatro capturas sociais do
artefato `14359738780` foram inspecionadas; ZIP SHA
`7c3fc44ef5b29f528d06aa1edf2afdaf468d55b1cf29c2fc9450f5455ff6167f`.
Sem vazamento horizontal a 390 px, mas a captura da viewport não mostrava o
cartão/formulário inteiro. As próximas provas sociais capturam a página toda;
os demais testes conservam o comportamento anterior do helper de captura.

0188 gerada em `44155351879`, fonte `11c4cf1d`, artefato `14359534587`;
ZIP SHA `66fefb1ba7573ee62c03efeb76ef7ca9e6de8b4864146e7b6153e5a7c5e86ddf`.
`0188_brave_mimic.sql`, 3.532 bytes, SHA
`5c420b1231c68a39d8a4e7c02c9db03637cffe297ed946754bf237102c169b1f`;
snapshot SHA `d2b2b2137b24d9579535701bc1a855817a901aecd12c53cbfedc894e050db858`;
journal SHA `d57a9168e56c9101fe9787d2c4736fa33e81ba4a18256dff61cfa94e0b5ba091`.
Arquivos conferidos e copiados intactos. Tabela de recibos nova e quatro
colunas nullable/checks na denúncia, sem alteração de dados anteriores.

A candidata da fundação também confere papel/2FA/banimento/sessão física de
expediente no banco e permite a composição de equipe sem jogador fictício.
Cinco provas PostgreSQL cobrem retirada de papel, 2FA, banimento, e-mail,
sessão apagada/do emissor web, teto de doze horas e vencimento durante espera.
A ordem aceita mundo antes de perfis para invalidar convites, sem mudar os
chamadores existentes. A revogação de aparelhos infantis foi extraída do writer
existente para que suspensão não reative aparelhos ou aprovações antigas ao
restaurar o perfil. Efeitos ainda sem rota/comando completo; não ativar a fila.

Revisão adicional identificou que a restrição ativa precisa sobreviver ao
expurgo da denúncia: o perfil afetado deve poder contestar sem receber dados
de quem denunciou, inclusive depois de 180 dias. O próximo incremento mantém
o fato mínimo da restrição por perfil enquanto vigente e cria recurso próprio,
sob autoridade do titular/responsável atual. Não ampliar a retenção da denúncia
ou fazer o alvo depender do protocolo de outra pessoa para recorrer. A decisão
da equipe precisa atualizar restrição, recurso e recibo atomicamente; restaurar
não recupera SID, aparelho infantil ou consentimento antigo.

O schema seguinte separa `profile_restrictions` (fato vigente; removido 90 dias
após liberação) de `restriction_reviews` (recurso próprio, até 180 dias). Uma
restrição perde a referência à denúncia expurgada, mas permanece contestável.
O recurso contém apenas perfil/revisão, espécie e conta atual de quem pediu,
estado/decisão e datas; nunca autor, motivo ou protocolo da denúncia alheia.
Sessão pareada revogada não vira autoridade de recurso: proprietário adulto e
responsável atual usam sua conta nativa. Suspensão legada sem recibo pode ser
observada como tal, sem inventar moderador ou data da imposição.

Comandos distinguem denúncia e recurso de restrição e vinculam o recibo à
espécie exata. O nome físico `report_revision` permanece por compatibilidade,
com campo TypeScript `caseRevision`; não renomear nem reescrever a coluna.
Recurso respondido em manter/reativar confirma decisão, estado do perfil,
restrição e recibo na mesma transação. Não restaurar por um caso antigo quando
existe recurso aberto; a equipe deve responder ao recurso. Referências pessoais
saem com o perfil conforme F7, sem prorrogar a denúncia original.

0189 final gerada em `44161305537`, fonte `9f04cf61`, artefato `14361994614`;
ZIP SHA `291a8241620c8a5f361ba2dd59a7674aefa40704d8dc98c47aa4d4361afbafc4`.
`0189_third_lady_bullseye.sql`, 7.351 bytes, SHA
`d30ad789072568cf327a781062c24ba9d7344d038391576fee1b6185f0f20a1e`;
snapshot SHA `57a125d62ba9986ea9da077da53b0606fff956a45df38babe80bfb72740b7dc3`;
journal SHA `f0861c090c93deabdbaa00087167a69dfc06f596d1b75403cf6813ef4fc08204`.
Arquivos conferidos e copiados intactos; gerações anteriores `44160404508` e
`44160775037` foram substituídas antes de adotar qualquer arquivo. Duas tabelas
novas, referência nullable/espécie com default nos recibos e expansão do check
de operações. A coluna física de revisão não foi alterada. Nada social foi
aplicado ao banco real, que permanece em 184 recibos/F1.

O recurso limita uma solicitação por conta atual e revisão da restrição,
além de uma fila aberta por perfil/revisão. Nonce recupera somente corpo/ator
iguais; novo nonce não multiplica o pedido existente. A revisão da restrição
usa a versão monotônica do perfil ao impor/liberar, sem reiniciar depois de
expurgar o histórico liberado. Leitura própria não exige login recente; envio
exige a prova nativa recente, nunca cobertura, perfil jogador do responsável
ou aparelho infantil. Sete provas PostgreSQL candidatas cobrem titular,
responsável sem jogador, pareado/antigo responsável, concorrência, expurgo da
denúncia, sigilo, corpo divergente, auditoria e vencimento.

A defesa estática de privacidade do Bastidores passa a incluir todos os módulos
de schema do Recreio, não apenas `recreio.ts`. Nenhuma coluna nova é liberada
genericamente: a futura fila precisa de projeção e exceção estrutural explícitas.

Comandos da equipe agora têm uma implementação candidata de transação e rota
`POST /api/moderacao/v1/comandos`. Só aceita prova HMAC curta, vinculada ao
corpo exato, assinada com `RECREIO_MODERATION_SECRET` exclusiva; ausência da
chave mantém o endpoint indisponível. O segredo não foi configurado em produção.
Sob travas ordenadas de contas, mundo quando necessário, perfis e caso, relê
papel/2FA, sessão física, banimento, revisão e prazo. Recibo global por UUID,
efeito, transição e auditoria são atômicos, com nova conferência do relógio ao
final. Replay exige o mesmo corpo/ator e a autoridade atual, sem repetir efeito.

A suspensão grava o fato mínimo vigente com a nova versão monotônica do perfil,
invalida ingressos/SIDs e troca a geração dos aparelhos infantis. Reativação
não ressuscita esses acessos. Havendo recurso aberto, a equipe deve respondê-lo:
uma denúncia antiga não permite contorná-lo. O recurso continua independente
da denúncia expurgada. Sete testes PostgreSQL adicionais foram preparados para
concorrência, CAS/replay, antigo papel, sigilo/expurgo, menor, auditoria e sessão
que vence durante a operação. Validação remota ainda pendente neste incremento;
fila e emissor do Bastidores, retenção ampliada e superfícies próprias seguem
em implementação. Não interpretar a rota candidata como moderação homologada.

Atualização da qualificação: recurso próprio `ed598853` passou nos sete gates
`44164112660`. Comandos `913adae9` passaram em 698 integrações/74 arquivos,
incluindo as sete novas provas; atualização de base 179→190 conservou dois
perfis, progresso/conquistas e repetição. Demais gates desse incremento ainda
em acompanhamento. Nada social foi implantado.

As quatro capturas completas do portal social em `4d01448`, artefato
`14363436584`, foram inspecionadas: adulto, criança, denúncia e responsável sem
jogador, 390 px, protocolo e controles completos legíveis, sem rolagem
horizontal. ZIP SHA `9f08fc8350bf102ad06c467da732acb23c45251d1d405b6e754892b5d43e2fba`.
São jornadas sintéticas do portal; não comprovam controles dentro da partida.

O próximo candidato acrescenta a página nativa
`/conta/perfis/[id]/restricao`, acessível ao titular adulto ou responsável atual,
com pedido idempotente, histórico mínimo e login recente para envio. Sem exigir
assinatura ou jogador do responsável. Não revela origem da denúncia nem
restaura acesso por conta própria. Duas jornadas de navegador e capturas
completas foram preparadas, ainda aguardando a execução remota.

A manutenção candidata encerra casos resolvidos após trinta dias e reduz o
prazo ao menor entre 180 dias da criação e noventa do encerramento. Cada expurgo
de recursos/comandos/restrições liberadas é limitado a 500, com `SKIP LOCKED`
e auditoria na mesma transação. Restrições ativas permanecem. Recurso próprio
aguardando mais de 24 horas ou que vença sem solução deixa a manutenção em
falha depois da limpeza auditada; não é tratado como atendido. O relógio da
denúncia usa recebimento/recurso, sem reiniciar em movimentações da equipe.
Quatro integrações adicionais candidatas cobrem prazo, revisão e rollback.

`1060056` passou nos sete gates `44167404900`, incluindo as duas jornadas nativas
de revisão. `913adae9` também concluiu todos os sete em `44165341339`. Capturas
novas de revisão ainda precisam de inspeção; não confundir aprovação automática
com revisão visual ou com a jornada da equipe.

O candidato seguinte introduz a fila read-only do Bastidores, vinte casos por
espécie, ordenação prioritária/antiga e busca exata de protocolo. Consulta
auditada, retorno da entrada/link externo com confirmação e prefetch desativado
para não registrar visita involuntária. Nenhum nome, nascimento, autoria da
denúncia ou conteúdo de mundo é projetado. A amizade pode ser desfeita na sua
revisão atual; a evidência original continua distinta da relação corrente.

O emissor usa sessão real do Bastidores com duas etapas, assinatura de trinta
segundos e confirmação explícita. Destino canônico em produção, sem redirect e
sem retry; perda de confirmação deixa a tela pedindo conferência, nunca dizendo
que nada mudou. O endpoint do Recreio continua sendo a autoridade final.
Novos testes candidatos exercitam a rota com prova assinada real, recusa do
segredo de jogo/ator em cabeçalho, corpo divergente/excessivo, retirada de 2FA,
projeção por conexão somente de leitura e rollback da consulta sem auditoria.
O runner isolado gera sua própria chave descartável. Nenhuma credencial real
foi criada, nem tabela social/novo console foi implantado.

O acompanhamento da denúncia pelo próprio perfil também exige provenance do
pedido de revisão, separada de quem registrou a denúncia. O schema candidato
acrescenta conta/espécie do autor da revisão e hash do corpo, sem ampliar a
retenção. Colunas nullable e check aditivo preservam recibos antigos sem essa
prova; não inventar autoria nem aceitar replay exato de recurso antigo sem
hash. Novos escritores devem gravar os três fatos de proveniência juntos.
O perfil pareado nunca recebe a conta do responsável nem a identidade da outra
pessoa; o responsável nativo só alcança perfis sob seu vínculo atual.

0190 gerada em `44170544967`, fonte `1af3c596`, artefato `14367587087`;
ZIP SHA `c6bf272755bd1dc2384d67221061c4032cbf6654f6a03f9c9e02a132e3bb8750`.
`0190_charming_wasp.sql`, 1.172 bytes, SHA
`1b5a4f578563bb1af1477eab15e0f57c0c4707dbbd85410f2193fd09fbb2b7c9`;
snapshot SHA `99c551676840b0c759ac956a4ba5414ec540651c3ffb60b816f328b63df6c1a1`;
journal SHA `f6a14a530361a5893261c772a0b578b686d05beb04490177785c07657f5e4c5c`.
Três arquivos conferidos e copiados intactos. Alteração aditiva; não transforma
linhas existentes nem inventa autoria. Base privada passa a 191 recibos;
produção continua com 184/F1 e sem tabelas sociais.

O acompanhamento candidato lista dez protocolos recentes ou um protocolo exato,
sempre pelo perfil atual ou titular/responsável nativo atual. Projeta só categoria,
estado, decisão e datas; não retorna outra ponta, conta ou evidência. Revisão
exige decisão resolvida há menos de trinta dias e respeita o teto original de
retenção; uma por caso, CAS e recibo de corpo/ator, auditoria e prazos revalidados
no final. Novo recurso não sobrescreve a denúncia nem ressuscita credenciais.
Seis integrações e uma jornada de navegador foram preparadas para autoridade,
sigilo, concorrência, replay, antigo responsável, prazo e falhas de auditoria.
A jornada usa sessão de equipe sintética já autenticada e chamada HTTP real;
não comprova a tela de entrada/desafio TOTP do Bastidores.

Revisão da resposta pode ser pedida no portal do jogador/pareado e na área do
responsável, com login recente para este último. Quem está jogando é relido no
servidor; perfil no formulário é só expectativa. A resposta anterior fica
identificada durante nova análise. A equipe só pode concluir como medida aplicada
se existir recibo de efeito confirmado naquele caso; teste adicional candidato
nega a declaração sem prova. Este incremento ainda aguarda os gates remotos.

`6ccda723` concluiu os sete gates `44170450100`, incluindo a projeção de
segurança do Bastidores pela conexão read-only. `64bc05aa` concluiu os sete
`44172641453`, com acompanhamento/revisão e a jornada HTTP da equipe sintética.
Nenhum deles comprova o desafio TOTP na interface do Bastidores ou implantação.
As duas capturas de revisão em `1060056`, artefato `14365919188`, foram
inspecionadas a 390 px: estado, protocolo e orientações legíveis, sem rolagem
horizontal. ZIP SHA `7b6cf47a8cb6100782fdf8e0cb495abc0f75103537efacff2c9a474a10c016a9`.

O candidato do host acrescenta painel modal acessível durante a partida, com
amizade por código, pedidos, presença, bloqueio/silêncio/remoção e denúncia pelo
SID atual. Não navega nem desmonta o jogo, não oferece gestão adulta e não
declara pausa/salvamento. Cena fica `inert`; diálogo nativo mantém o foco e
Escape/fechar retornam à partida. Código/nonce ficam só na memória da interface;
nada de storage, URLs externas ou retry automático. Cada atualização faz uma
leitura, sem duplicar GETs; fechamento não dispara leitura posterior à mutação.

A negociação opt-in passa a representar suporte ao protocolo, sem depender de
`RECREIO_SOCIAL_MODE`. Desligar novos contatos continua recusando emissão/pedido
no servidor, mas uma nova partida conserva leitura e proteção de conhecidos.
Clientes sem opt-in continuam sem campo/métodos novos. Regressão candidata
reabre o mesmo adulto com o modo desligado, confere a amizade e bloqueia/remove
com o novo SID, mantendo a emissão de código recusada.

Duas jornadas candidatas: contador compartilhado continua recebendo mudanças
do outro navegador enquanto o painel está aberto, sem saída de SID, e bloqueio
não remove membros do mundo; no Morada, digitar espaço no painel não altera o
ritmo, o atalho volta a funcionar na cena após fechar e a saída continua pelo
jogo com confirmação. Capturas mobile preparadas para controles e diálogo.
Essas provas ainda aguardam o GitHub; não são medição de FPS ou hardware real.
Participantes não amigos e demais políticas de mundo continuam em F5, e a
jornada de entrada/atendimento pela interface do Bastidores permanece pendente.

### Ajustes de qualificação do host e acompanhamento no SDK

`44177910361` aprovou seis gates, incluindo a integração corrigida pelo escritor
real de encerramento. A candidata anterior fabricava `endedSeq` acima da
sequência real em duas fixtures, contaminando o cursor da manutenção; `1f46e3c`
removeu esses valores e usa o mesmo escritor transacional da aplicação. Não
houve alteração ou relaxamento do cursor de produção.

O E2E encontrou saída do foco dos controles no ciclo de Tab do diálogo. A
correção candidata fecha os limites de Tab e Shift+Tab nos controles visíveis e
habilitados, mantendo Escape e o botão de retorno. A jornada verifica ambos os
sentidos; a partida não é desmontada ou encerrada pelo painel.

A candidata seguinte acrescenta leitura mínima dos próprios protocolos e pedido
de revisão ao SDK e ao painel, com o SID atual e sem perfil/ator fornecido no
corpo. Três integrações cobrem resposta perdida, repetição explícita, ausência
de retry, privacidade, SID encerrado, campos estranhos e limite do corpo. A
jornada do host consulta o protocolo acabado de receber antes de bloquear o
contato. IDs UUID tipados e os contratos F4 passam a normalizar a caixa, pois o
PostgreSQL devolve minúsculas; repetição HTTP com UUID maiúsculo deve recuperar
o mesmo recibo. Identificadores textuais da autenticação não mudam. Estas
alterações ainda precisam dos gates remotos; não foram ativadas em produção.

O gate dedicado `equipe` prepara portal compilado e Bastidores em modo de
desenvolvimento local, com banco descartável, segredos efêmeros e e-mail em
arquivo. Não altera validações de produção. Só o papel inicial da conta é
fixture; senha, confirmação do e-mail para ativação, chave exibida, TOTP,
saída e nova entrada com desafio são reais. A jornada consulta a fila sem
nomes, exige confirmação do efeito, suspende o alvo, inicia/conclui a análise
com recibo de medida e confere a resposta da pessoa e os dois rastros de cada
comando. O build de produção do Bastidores e a prova operacional continuam
gates separados. Esta jornada ainda é candidata, não evidência aprovada.

- [ ] Acrescentar métodos/eventos portáteis do SDK e superfícies sociais no
  portal/host. Tela infantil não herda gestão adulta; schema servidor não entra
  no bundle da interface para obter constantes.
- [ ] Garantir bloquear/silenciar/remover/denunciar nas superfícies que exibem
  outra pessoa. Reutilizar tokens visuais, hidratação, foco e mensagens claras.
- [ ] Provar no GitHub dois adultos, adolescente e criança, com aprovação,
  presença privada, bloqueio, denúncia e recusas por chamadas diretas. Conferir
  CSP, erros de navegador e capturas mobile; nenhum teste pesado nesta máquina.
- [ ] Executar gates próprios e compartilhados, restauração atual, atualização
  de base anterior com dados e implantação limitada na main pública. Fixar
  fonte/configuração/receipts em produção; jamais publicar a main local com D3.
- [ ] Atualizar documentação, catálogo e direitos de F7 conforme os dados
  realmente persistidos. Ativação depende dos demais aceites de F1–F11.
