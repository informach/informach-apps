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
