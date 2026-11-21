# Recuperação: fronteira com o banco compartilhado atual

Continuação autorizada de F7/F8/F10. A restauração física é privada; o destino
compartilhado recebe somente o schema Recreio preparado. Não substituir
`core`, `billing`, auditoria ou dados dos demais aplicativos pelo arquivo antigo.
Este plano não declara publicação implementada ou tráfego recuperado liberado.

## Etapas e estado

1. Restaurar e conferir inventário antes de qualquer normalização; remover
   capacidades transitórias, autenticar e reaplicar o livro de direitos. As
   provas anteriores permanecem exigidas. Encerramento nativo com contrato pago
   passou em 44876187749/2967cf32: treze GETs/um POST fechado, leitura posterior,
   período/fatos de todos os pagantes preservados, efeitos e recibo individual.
   Quarenta e três objetos e clusters removidos. Não foi pagamento real.
2. Conferir os vínculos com o destino compartilhado atual. A candidata
   `scripts/backup/vinculos-globais.ts` lê o catálogo real de FKs e suas referências
   transitivas. Exige identidade existente e os mesmos vínculos de cliente,
   contrato e linha paga. Não copia identidade, sessão ou financeiro globais.
   Mudanças atuais de bloqueio/estado financeiro entram no retrato; identidade
   ausente ou cliente reatribuído exige revisão. Qualquer cliente atual ainda
   exige conciliação financeira própria, inclusive quando não constava do arquivo.
3. Resolver diferenças antes de preparar o schema. Sessão global temporária
   ausente não pode ser recriada para satisfazer a FK de `personal_exports`:
   aplicar o efeito de descarte correspondente no banco privado, conservando
   auditoria e os direitos permanentes. A conferência candidata apenas informa
   a dependência; não executa esse descarte nem admite tráfego.
4. Concluir conciliação atual de todos os pagantes/contratos e permissões, com
   evidência própria. O retrato de vínculos é descritivo; não é confirmação do
   Stripe, prova de pagamento, retomada de consentimento ou autorização de dados.
5. Preparar schema de estágio no banco privado, usando nomes gerados e dump
   nativo do schema renomeado, sem reescrever SQL ou importar globais históricos.
   Conferir dependências de entrada externas, versão/migrations e integridade.
   Importar estágio somente depois das provas, preservando o schema anterior.
6. Parar/drenar as versões antigas, renovar credenciais próprias, invalidar
   somente o namespace Redis do Recreio, reler os fatos atuais sob a transação
   de publicação e trocar o schema atomicamente. Falha precisa conservar o
   schema anterior; nunca usar `FLUSHALL` nem restaurar o PostgreSQL inteiro.
   Reabrir livro com chave nova e recibo próprio somente após a conclusão.
7. Repetir duas recuperações completas consecutivas; conferir fontes,
   configuração, saúde e experiência antes de reabrir tráfego. As duas cópias
   físicas anteriores não encerram este requisito.

## Perfil da conferência candidata

Somente leitura, transações repetíveis com prazos, UTC e limite de dez mil
referências por destino. Aceita os cinco alvos reais da candidata 0244:
`core.users`, `core.sessions`, `billing.customers`, `billing.subscriptions` e
`billing.subscription_payment_periods`. Destino/coluna não reconhecido é falha,
nunca autorização para ampliar a consulta. Não lê tokens, IP, corpo de sessão,
metadados livres de cobrança ou email para emitir o retrato.

A prova candidata usa um terceiro cluster Unix descartável como destino atual,
com perda sintética apenas do schema Recreio. A preparação da fixture altera
bloqueio/estado financeiro atuais e exercita cliente atribuído a outro app e
identidade ausente. Cada chamada da conferência compara inventários antes/depois
de origem e destino; não pode inserir usuário fantasma ou modificar outro domínio.
Sem URL/credencial da origem, dados reais ou pedido ao Stripe. Os agregados da
prova não substituem a homologação da publicação seletiva restante.

Referência técnica: [ALTER SCHEMA no PostgreSQL 18](https://www.postgresql.org/docs/18/sql-alterschema.html).
Renomear exige propriedade do schema e CREATE no banco; isso não valida por si só
as dependências, os dados nem a segurança do corte.
