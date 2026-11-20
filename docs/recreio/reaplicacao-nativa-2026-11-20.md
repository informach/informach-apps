# Reaplicação nativa dos direitos após restauração

Frente F8 em implementação. As provas existentes restauram/normalizam a
captura e invalidam capacidades; ainda não comprovam esta reaplicação.
Não admitir tráfego ou anunciar recuperação completa a partir delas.

## Causa e separação das autoridades

O solicitante pode não existir no backup, mesmo que o perfil selecionado já
existisse: por exemplo, uma responsabilidade mudou depois da captura. Uma
preparação interativa tem FK para `core.users`. Recriá-la com conta fictícia,
login do operador ou datas inventadas não preservaria o consentimento original.
Um mundo mencionado no plano também pode não existir no backup. A FK de
`rights_worlds` exige mundo vivo; simplesmente omitir esse mundo quebraria a
comparação integral do plano assinado.

A operação restaurada terá uma proveniência de recuperação distinta da prévia
interativa: plano original, solicitante histórico, importação efetiva e execução
ligada ao cabeçalho congelado/captura. Essa fonte não é identidade ou concessão.
A preparação nativa conserva sua FK e as exigências de login recente. Uma
operação tem exatamente uma das duas proveniências, com escopo composto no banco.
Nenhum processo público ganha um modo para ignorar o livro ou as permissões.

## Sequência de implementação e prova

1. Persistir execução e fontes históricas sem FK para uma identidade fictícia.
   Conservar assinatura, intenção, fonte e datas originais da decisão; registrar
   a importação separadamente. Gerar/adotar a migration no GitHub.
2. Resolver a fonte original em um leitor comum aos workers, conferindo SHA,
   assinatura e seleção completa. Referências de mundos ausentes ficam
   explícitas no mapa recuperado; não criar mundo vazio nem reduzir a seleção.
3. Admitir execução offline somente com prova do cluster privado, inventário
   autenticado comparado, capacidades revogadas e prefixo inteiro congelado.
   O contexto privado deve ser vinculado à conexão/cerca; workers normais
   continuam exigindo livro aberto e chave corrente.
4. Reaplicar retirada com os mesmos preparadores de foto/diário e efeitos
   pessoais. A responsabilidade histórica assinada não reatribui a guarda do
   backup ao solicitante. Ausência do perfil é recibo explícito, não descarte
   silencioso da seleção. Preservar dados dos demais e prazos técnicos originais.
5. Reconciliar finanças antes de efeitos de encerramento. Clientes/origens que
   surgiram depois da captura precisam de proveniência autenticada e leitura
   completa do provedor; inexistência local não prova inexistência remota.
   Não criar identidade, período pago ou aceite de sucessão por suposição.
6. Conferir todos os efeitos/pendências, emitir recibo durável, normalizar
   identidade e destinos/chaves atuais e só então admitir tráfego. Operações
   inconclusivas e mundos que precisam de sucessão real permanecem bloqueados,
   com diagnóstico e resolução explícitos; não atribuir responsabilidade ao admin.

Casos obrigatórios: backup anterior ao consentimento; solicitante ausente e
perfil presente; perfil ou mundo ausente; relações antigas diferentes das
assinadas; plano/scope/cerca corrompidos; última entrada inválida antes de qualquer
efeito; rollback/reinício/repetição; dados de terceiro preservados; fechamento
com e sem cobrança; origem financeira posterior ao backup; quitação/reconciliação
distintas; prefixo mudando; chave nova e recibo externo antes da reabertura.

## Limites já identificados

O plano atual registra os mundos e contadores, sem reconstruir sozinho um
sucessor aceito que não exista na captura. Não inventar esse aceite nem apagar
o mundo de terceiros. Também não resolve sozinho toda a origem financeira
posterior ao backup. Esses casos exigem protocolo autenticado de reconciliação,
com quarentena até a prova; não podem ser classificados como concluídos apenas
porque os demais passos da cópia funcionaram. Revisão de retenção/checkpoint do
livro e inventário dos mundos legados continuam parte do fechamento.


## Primeiro incremento em candidata

Duas tabelas guardam execução e fonte histórica, sem conta ou mundo fictício.
A preparação nativa conserva sua FK; a operação admite exatamente uma origem,
inclusive recusando ambas nulas pela semântica SQL de CHECK. A fonte recuperada
é vinculada ao ator/versão de plano/tipo/livro por FK composta e não pode nascer
como publicação de novo consentimento.

O leitor histórico usa o parser/SHA canônico e confere o mapa inteiro contra
o plano e o banco (incluindo ausência efetiva). Retorna execução não autorizada.
Os nove leitores dos workers interativos usam uma porta explícita que recusa
fonte recuperada; o verificador normal conserva a mesma barreira. Nenhuma
exceção ao cabeçalho aberto/chave corrente foi introduzida. Pedido interativo
não reutiliza ID já ocupado por uma operação recuperada.

A prova preparada usa perfil real em PG, solicitante ausente, mundo presente e
mundo ausente, origem inválida/dupla/nula, mapa truncado/divergente e tentativa
de uso pela porta interativa. Não comprova consentimento nativo, prefixo externo,
efeitos offline, finanças ou tráfego restaurado. Migration e gates ainda pendentes.
