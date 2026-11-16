# Responsabilidade pelo mundo: transferência com aceite

Em implementação. Não conclui A6, proteção familiar ou homologação comercial.
Testes, builds e geração de migrações somente no GitHub. Base publicada:
`6e640e99`, Mundo V2/protocolo 1/arte D2. Não publicar a frente D3 local.

## Fatos que a implementação precisa respeitar

- O responsável ainda não pode sair. A saída atual preserva o mundo e encerra
  só as sessões do convidado; não escolhe sucessor automaticamente.
- O convite e o membro têm autoria por ID de membro, mas hoje falta FK que
  comprove que esse autor pertence ao mesmo mundo. O novo pedido também
  precisa dessa integridade. Membros permanecem no histórico mesmo quando
  o perfil fica nulo; não referenciar identidade por nome.
- A cota atual de criação consulta `createdByProfileId`. Transferência não
  reatribui esse campo, não reinicia a cota e não transfere assinatura/saldo.
- O host recebe papel/participação na admissão. `garantirAcesso` retorna se
  já existir acesso persistido; mudar só o papel no portal deixa capacidades
  antigas no jogo. Há concessões derivadas do Recreio e concessões do fundador
  da família simulada: preservar sua proveniência e as identidades.
- O batimento tem cinco motivos fechados de encerramento. Acrescentar
  `permissions_changed`, sem classificá-lo como saída, troca de aparelho ou
  perda comercial. O SDK do navegador conserva motivos desconhecidos como
  texto e tem parada genérica; o host valida a lista fechada e precisa ser
  atualizado antes do primeiro escritor do novo motivo.

## Etapa 1: integridade e leitores, sem oferta/aceite habilitados

1. Gerar a unicidade `(space_id,id)` dos membros em migração própria, antes
   das FKs compostas que a referenciam. Gerar pelo script do projeto no GitHub,
   revisar SQL/snapshot/journal e nunca editar os arquivos gerados.
2. Inventariar apenas contagens de referências inválidas no banco real.
   Criar as FKs por mundo para autoria de membros/convites, sem apagar ou
   inventar proveniência. Se houver dado inválido, resolver por operação
   explícita antes de apertar a restrição.
3. Acrescentar `space_stewardship_requests`: UUID, mundo, membros solicitante
   e destinatário, estado, criação, validade e conclusão. FKs compostas preservam
   o escopo; somente um pedido pendente por mundo, índice do destinatário e
   checks de estados/prazos. Nenhuma criação de pedidos nesta etapa.
4. Acrescentar o motivo de encerramento ao banco, contrato, host e mensagens
   do portal. Mensagem neutra e volta à estante para uma nova admissão.
   Não renovar a sessão antiga nem encerrar sessões de outros mundos.
5. Conferir leitores antigos/novos, PG 16/18, integridade negativa e positiva,
   todos os consumidores atingidos e os seis gates do Recreio. Implantar e
   conferir schema, leitores ativos, drenagem, prontidão e arte D2 antes da
   etapa 2. Depois de emitir o motivo novo, o rollback mínimo conserva leitores
   compatíveis; não reclassificar encerramentos históricos para caber no antigo.

## Etapa 2: oferta e aceite, somente adultos

O responsável propõe a outro membro adulto atual, sem transferir a autoridade
nesse ato. Validade de 24 h e autenticação recente tanto para propor como para
aceitar. Reusar o login nativo: seleção de perfil e renovação da sessão não são
provas de autenticação recente. Não criar um segundo emissor de OTP.

O destinatário consulta somente pedidos próprios na Conta, inclusive sem
cobertura comercial, e aceita ou recusa explicitamente. Só o responsável
atual cancela uma oferta. Estado/mundo/participação e autoridade são relidos
depois das travas; saída de qualquer participante cancela ofertas relevantes.
Aceite repetido devolve seu recibo, sem reaplicar uma transferência antiga.

A transação conserva a ordem perfil/aparelho → mundo → membros/pedido →
cursor de encerramentos → partidas, relendo prazo e autenticação depois das
esperas. Troca os papéis e o responsável atomicamente, encerra as sessões dos
dois perfis somente nesse mundo, invalida ofertas antigas e grava auditoria
estrita. Sem nomes, e-mails, códigos ou conteúdo na auditoria.

Antes de habilitar o escritor, provar no servidor do Morada a reconciliação
das capacidades derivadas da plataforma e a conservação dos direitos próprios
da família simulada. Não trocar personagens, participação ou históricos para
fazer o teste passar. Uma reentrada precisa receber a autoridade atual.

## Aceite da entrega

PostgreSQL real descartável: escopo, menor/aparelho/autenticação inválidos,
prazo vencido durante espera, concorrência de aceitar/cancelar/sair, oferta
antiga após reingresso, falha real de auditoria e idempotência. Navegadores:
dois adultos, confirmação/cancelamento, mensagem de mudança de permissão,
continuidade do mundo e saída posterior do antigo responsável. Servidor/WS:
papel atual e capacidades corretas após reconexão/restauração, com o limite
de propagação documentado. Arquivamento e exportação/exclusão continuam
incrementos próprios; não habilitar exclusão automática de conta nesta etapa.

## Geração e inventário da etapa 1

Inventário somente de leitura às 14:31:26 UTC: dois membros, zero convites,
seis sessões de jogo e zero referências inválidas de autoria/motivo. Não há
backfill ou exclusão implícita. O inventário deve ser relido antes de implantar.

A geração `43886570169`, fonte `ee4bf72a`, produziu a 0165
`mean_blazing_skull`: somente a unicidade dos membros por mundo/ID,
SHA-256 `743825d491876fbf3bbac0b8fa9a5f79a8d4bc06683a5a1f4cced03ebf932989`.
A geração `43887205067`, fonte `dd63db2e`, produziu a 0166 `silly_lizard`,
SHA-256 `8b794cef5c6cd9e85b64069048513efcdc74d62bf087de98a6d5071fa89a6e6a`.
Ela cria o pedido e seus checks/índices/FKs, aperta o escopo das duas autorias
existentes e amplia somente o check de motivo da sessão. O prefixo de 165
entradas foi preservado, seguido por duas entradas: journal final com 167.

Os três arquivos de cada artefato foram conferidos por bytes/SHA antes da
cópia. Comparação completa dos snapshots encontrou somente essas diferenças;
o SQL e os metadados gerados não foram editados. A unicidade vem primeiro para
as FKs compostas já encontrarem sua chave de referência, na mesma sequência
do migrator. As consultas mantêm os limites operacionais já implantados.

Quinze casos de estrutura no banco descartável cobrem escopo, unicidade,
histórico, estados/prazos, membro sem perfil e encerramento com cursor/auditoria.
O contrato comum de instâncias exercita `permissions_changed` pelo SDK e pelo
HTTP; a bancada do Morada verifica retirada da conexão e liberação da reserva
no batimento, conservando a outra pessoa. O portal reconhece o motivo com uma
mensagem própria, sem reutilizar a sessão encerrada; motivos futuros ainda têm
parada genérica. Esses testes ainda precisam da execução remota da candidata.
