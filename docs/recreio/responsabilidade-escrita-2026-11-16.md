# Escrita da transferência: candidata sem ações expostas

Continuação da [preparação](responsabilidade-aceita-2026-11-16.md) e da
[reconciliação do Morada](acessos-na-reentrada-2026-11-16.md). Não implantada.
Não há Server Action ou tela para propor/aceitar neste incremento. A etapa 2
continua incompleta até sua homologação de ponta a ponta com duas contas.

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

O PostgreSQL descartável verifica oferta/aceite/repetição, datas do login,
aparelhos, escopo, recusa/cancelamento/expiração, saída do destinatário,
encerramentos/cursor, conservação de partidas de outros contextos, concorrência
e falha real de auditoria. Geração de tráfego, testes e builds somente no GitHub.
Ainda faltam resultados remotos, regressões de espera por trava, interface,
recuperação pelo login nativo e prova com as duas contas em navegador.
