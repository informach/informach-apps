# Recreio — objetos privados e recuperação, F8

Em implementação. A primeira leitura do ambiente confirmou 34 serviços, três
volumes e zero buckets. Depois dos gates fechados, foi criado somente o bucket
isolado de homologação abaixo. Nenhum serviço do portal/jogo foi alterado,
nenhuma agenda foi habilitada e nenhum dado de produção foi movido.

## Contrato do provedor e composição necessária

A [documentação oficial Railway](https://docs.railway.com/storage-buckets#s3-compatibility)
admite objetos privados por S3, mas ainda não oferece versionamento, object lock,
lifecycle ou cifragem configurável do lado do servidor. O cliente deve usar a
região e o estilo de URL reais da credencial. O conector retornou busca válida,
mas falhou ao ler a página; a página oficial foi lida diretamente.

Fotos/exportações e backups precisam de buckets e credenciais separados. O
portal não deve receber a credencial dos dumps do banco compartilhado. Política
de expurgo e detecção de órfãos pertencem ao serviço; existência de bucket não
comprova backup, imutabilidade ou recuperação. Chaves de cifragem permanecem
fora dos objetos, com recuperação própria e retenção das versões necessárias.

## Primeiro componente em candidata

`features/objetos/criptografia.ts` contém um envelope limitado em memória com
AES-256-GCM do Node: IV aleatório de 96 bits por gravação e tag de 128 bits.
Cabeçalho, tipo e contexto técnico são autenticados como AAD; checksum e tamanho
da referência autoritativa são conferidos antes de devolver conteúdo. O objeto
não contém a chave ou o checksum do texto aberto. Não há plaintext devolvido
antes da validação da tag; buffers intermediários abertos são zerados.

O chamador fixa um limite positivo de até 256 MiB; o limite do manifesto e a
cota do produto continuam sendo obrigações adicionais do adapter. O componente
recusa excesso em vez de truncar. Backups maiores exigem executor de arquivo ou
stream autenticado, sem liberar partes não autenticadas ao restaurador.

O formato carrega versão/chave e contexto técnico UUID para foto, exportação,
backup ou recibo de retirada. A referência deve vir do banco/recibo confiável,
nunca dos metadados que chegaram do bucket. Rotação lê objetos antigos somente
enquanto a chave correspondente existe; não há fallback para chave ativa ou
bytes legados. A configuração é copiada para impedir alteração por referência.

Não usa SDK S3 nem novas dependências; não realiza rede, persistência,
autorização ou migração. Precisa passar no GitHub antes de ser considerado
validado. A API de criptografia foi conferida na
[documentação Node 24](https://nodejs.org/docs/latest-v24.x/api/crypto.html).
As versões Node/dependências do repositório permanecem fixas.

## Dependência candidata do adapter S3

O adapter seguinte usará `@aws-sdk/client-s3` fixado em `3.1172.0`, primeiro SDK
S3 neste app, sem atualizar as dependências existentes. Metadados do registro
oficial npm consultados nesta execução: Node >=20, Apache-2.0, integridade
`sha512-ByCRHFlL9yui61J5e4w9nrDZcRUbAzd+78z9Q1DQWoAT2HE1XwjtDGEx86GdNTu1+oSyerNhl8eijF6jMUvEpg==`.
A [API oficial do SDK](https://github.com/aws/aws-sdk-js-v3) foi consultada via
Context7. O lockfile será resolvido no GitHub, sem hooks, e adotado somente após
conferir proveniência e diff: nenhum pacote é instalado nesta máquina.

## Integração e provas restantes

1. Adapter S3 com credenciais apenas no servidor, timeout/corpo limitados,
   escrita e recuperação pelo mesmo recibo e leitura íntegra antes de confirmar.
   Homologar no bucket real isolado; tratar resposta perdida e exclusão própria.
2. Foto nova: preparar operação sob autoridade/cerca, I/O fora das travas,
   reler cerca/revisão na confirmação. Objeto órfão não vira fotografia válida.
3. Migração aditiva: ler bytes existentes, conferir SHA, cifrar/enviar/reabrir,
   confirmar ponteiro sem retirar o original antes da homologação. Não alternar
   silenciosamente para a cópia antiga quando um objeto estiver corrompido.
4. Recortes F7: captura consistente, artefato privado, download autenticado
   revogável e expurgo. O envelope não concede direito de baixar um objeto.
5. Backup: dump consistente da origem somente de leitura, cifragem e recibo,
   agenda e retenção delimitadas; restaurar o objeto realmente armazenado em
   destino novo, conferir conteúdo/estrutura/limpeza e medir RPO/RTO.
6. Retirada de identificadores: recibos concluídos devem sobreviver à recuperação
   e ser reaplicados antes de servir conteúdo restaurado. O backup antigo não
   autoriza reintroduzir dados de uma exclusão posterior.

Todos os testes, builds, ensaios de bucket e restauração rodam no GitHub ou no
executor operacional remoto. O ensaio lógico já realizado não fecha F8.


Lockfile gerado em `44430415152`/`8b1ff3f2`, pnpm 9.15.0 e Node 24.15.0,
e adotado intacto após conferir arquivo, integridade do SDK, manifesto e
proveniência. Os 1413 packages e 1421 snapshots existentes permaneceram iguais,
assim como todos os outros importers; só foram acrescentadas as 25 entradas
necessárias e a dependência do Recreio. [Recibo e hashes](evidencias/objetos-s3-lock-44430415152.json).
A instalação e qualificação desta composição ainda exigem seus gates remotos.

## Adapter S3 em candidata

`features/objetos/s3.ts` recebe o cliente composto no servidor e um bucket
próprio. A chave do objeto é derivada exclusivamente de contexto UUID/tipo e
checksum cifrado validados; não recebe URL ou caminho do navegador. O cliente
deve ter `maxAttempts=1`, e um prazo abrange requisição e consumo do corpo.
GET aceita apenas resposta integral com tamanho e tipo corretos, limita cada
chunk e fecha o socket ao abortar. Depois confere envelope, tag e SHA.

O envio exige envelope íntegro, usa `If-None-Match: *` e relê o objeto antes de
confirmar. Uma resposta 412 também precisa dessa releitura; presença/ETag não
comprovam conteúdo. Perda de resposta permanece inconclusiva, sem repetir PUT.
Recuperar usa a mesma referência; ausência não autoriza escolher outra chave.
O escritor nativo deve persistir tentativa, envelope e referência antes da rede
e reler a autoridade/cerca na confirmação. Essa integração ainda não existe.

Os novos testes usam o SDK real contra HTTP fechado no runner, com credenciais
sintéticas e sem serviço externo. Precisam de gate remoto próprio. Não provam
compatibilidade real das condições S3 com o Railway, permissão de download,
catálogo, migração ou backup. A referência do envelope agora conserva também o
tamanho cifrado exato; o formato ainda não foi implantado.

O workflow `recreio-objetos.yml` prepara a prova externa somente após tipos e
testes fechados. É manual, exige o nome exato de um bucket dedicado cujo nome
começa por `recreio-homologacao-`, credenciais próprias e executor GitHub do
repositório. Não usa o bucket de jogo ou de backup. Antes do PUT, exige prefixo
UUID vazio e grava recibo técnico. A prova usa apenas texto sintético, verifica
replay, tenta sobrescrever o próprio objeto para exigir 412 e testa negativa
de leitura anônima. Limpeza remove somente a chave criada pela operação, exige
inventário completo vazio e GET ausente; limpeza e sucesso são fatos separados.
O workflow não cancela uma execução em andamento para preservar essa limpeza.

Prova preparada não é prova executada. O bucket dedicado foi provisionado;
a credencial do runner e a evidência do provedor continuam pendentes, conforme
o registro operacional abaixo.


## Gates e estado operacional

`86eac206` concluiu quality em `44431685752`: dezesseis testes do envelope e dez
do adapter S3, além dos tipos e demais verificações do gate. A fonte seguinte
`df2845fc` passou no job `qualify` de `44432492043`, incluindo o script de prova,
tipos e os mesmos 26 testes. O job `provider` não executou nessa rodada.
Esses resultados não certificam armazenamento ou backup implantados.

Em 19/11 às 00:57 UTC, o bucket exclusivo `recreio-homologacao`
(`14cbada1-04eb-45cd-be30-94e10e4ba333`), região `sjc`, já estava provisionado.
Nome S3 `recreio-homologacao-c0xyqx`, endpoint oficial `t3.storageapi.dev`, região
de assinatura `auto` e estilo virtual-host conferidos pela CLI autenticada.
É somente homologação; nenhuma credencial do Postgres foi lida por essa etapa.

A revisão automática bloqueou a configuração das seis credenciais/valores
restritos no GitHub Actions, com a única razão `blocked by policy`; a chamada
não executou. A lista de segredos foi relida e conserva somente os três
anteriores. A prova real não foi iniciada nem houve upload por este ensaio.
O titular recebeu uma pergunta sobre autorizar essa configuração restrita;
não foi solicitado que envie segredos no chat. Trabalho independente continua.
