# Responsabilidade com aceite: candidata do portal

Continuação da [preparação](responsabilidade-aceita-2026-11-16.md) e da
[reconciliação do Morada](acessos-na-reentrada-2026-11-16.md). Não implantada.
O portal candidato oferece proposta, aceite, recusa e cancelamento em
`/conta/mundos/[id]/responsabilidade`, acessível pelas próprias participações.
Essas ações não foram publicadas. A etapa 2 continua incompleta até os gates,
a implantação prévia dos leitores e a homologação com duas contas.

O adapter de autoridade não recebe parâmetros: lê login nativo e perfil ativo.
A prova usa `session.createdAt`, não renovação, seleção de perfil ou data enviada
pelo navegador. O cache de cookie já está desligado no Recreio. A criação e o
aceite exigem até dez minutos desde o login; o prazo é relido pelo relógio do
banco depois das travas. A prova precisa ter o mesmo ID de login do aparelho.
Referência: [autenticação recente do Better Auth](https://www.better-auth.com/docs/concepts/session-management#session-freshness).

O repositório trava perfis adultos ordenados e aparelho, mundo, membros e
pedido. No aceite, trava o cursor de encerramentos e as partidas antes de
reler todos os prazos. A proposta vale 24 horas. Repetições conservam o recibo;
uma decisão terminal nunca reaplica papéis. Aceite e cancelamento se serializam
pela linha do mundo. Uma proposta vencida recebe estado e auditoria próprios.

A troca conserva o criador, IDs e participação. O antigo responsável fica como
membro; o destinatário se torna responsável. A transação encerra somente as
partidas dos envolvidos naquele mundo, por `permissions_changed`, e grava
auditoria estrita. Assinatura e cota de criação não mudam. A saída de um membro
revoga sua oferta pendente na mesma transação. Nenhum conteúdo do mundo é lido
ou alterado por essa operação.

Na auditoria dos encerramentos, o ator é quem aceitou a transferência, inclusive
na partida do antigo responsável. `targetId` conserva a conta afetada de cada
partida. O helper admite esse ator explícito do contexto autenticado; o contrato
anterior de ações da própria conta e decisões automáticas continua separado.

Propor e aceitar exigem os dois adultos atuais elegíveis. Cancelar pelo
responsável atual, recusar pelo destinatário e reler seu recibo terminal
conservam a autoridade do próprio solicitante; não dependem de a outra parte
continuar ativa ou ter perfil. O membro histórico permanece como referência.
Essas operações não reaplicam papéis nem concedem acesso a um perfil suspenso.

O PostgreSQL descartável verifica oferta/aceite/repetição, datas do login,
aparelhos, escopo, recusa/cancelamento/expiração, saída do destinatário,
encerramentos/cursor, conservação de partidas de outros contextos, concorrência
e falha real de auditoria. Geração de tráfego, testes e builds somente no GitHub.
O painel mostra ao responsável somente os adultos elegíveis do próprio mundo.
O destinatário vê somente sua proposta, sem lista de outros membros ou conteúdo,
inclusive sem cobertura comercial. Participação encerrada ou alheia é recusada.
O teste de navegador usa duas contas sintéticas e envelhece apenas os metadados
de login no PostgreSQL descartável. Ambas devem autenticar novamente pelo fluxo
nativo, escolher seu perfil e voltar à proposta; a seleção de perfil preserva
o destino interno validado no servidor. Depois do aceite, o antigo responsável
pode sair e o novo continua com o mundo. Capturas são de dados sintéticos, sem arte.

Ainda faltam os resultados remotos desta interface, regressões de espera por
trava, revisão, implantação dos leitores e prova de operação. Não declarar A6
ou o Recreio concluídos a partir desta candidata.
