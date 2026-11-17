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
