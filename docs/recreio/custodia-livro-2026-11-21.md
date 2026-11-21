# Custódia e inicialização explícita do livro de direitos

O livro externo tem destino e chave MAC próprios, separados dos arquivos AES
de backup e fotografias. Essa custódia não concede login, consentimento de
família, cobrança ou publicação de uma recuperação. O fluxo público e o job
normal continuam recusando livro ausente; não fazem inicialização implícita.

## Papel operacional em candidata

`inicializar-livro-direitos.ts` recebe somente a custódia do livro e a fonte
real do deploy. Recusa credenciais de banco, autenticação, SMTP, Stripe e host.
A configuração deve ter escopo production, com bucket e UUID repetidos como
alvos explícitos no comando. O SDK permite apenas GET/PUT do cabeçalho e do
histórico inicial desse prefixo. Inspeção permite só GET. Não há LIST/DELETE,
decisão pessoal, plano, intenção, mudança de época ou rotação nesse papel.

```text
node /opt/recreio/inicializar-livro.cjs --inspect UUID_DO_LIVRO BUCKET_ESPERADO
node /opt/recreio/inicializar-livro.cjs --initialize UUID_DO_LIVRO BUCKET_ESPERADO
```

A ausência do objeto pode levar à criação somente pelo segundo comando.
Bucket ausente, acesso recusado, corrupção, chave ou destino divergentes são
falhas. O armazenamento nativo grava histórico/cabeçalho com If-None-Match e
relê a assinatura. Repetir a inicialização de livro válido só lê e conserva
bytes, estado e datas, inclusive se já estiver congelado ou tiver decisões.

O Docker usa Node fixado e leva somente o bundle final, executado como usuário
node, sem fonte do app, PostgreSQL ou servidor web. O inventário do esbuild
recusa imports de banco/auth/billing, jogos, outros apps e módulos do app fora
da lista revisada. O workflow `recreio-livro.yml` executa tipos, SDK/HTTP real,
build remoto e a recusa do comando implícito sem rede, em filesystem read-only.
Não recebe credenciais de produção. O artefato registra fonte e SHA do bundle.

## Preparação e aceite operacional

Conferir no Railway o custodiador sem deploy/rede e os destinos existentes
antes de acrescentar o namespace próprio. Conservar os vinte valores anteriores,
usar credenciais exclusivas do novo bucket e MAC aleatório de 32 bytes, guardar
a cópia fora do Git com DPAPI do usuário e comparar a persistência sem imprimir
valores. O serviço de inicialização recebe só referências ao namespace do livro;
nunca herda credenciais do arquivo ou do banco. Executar uma vez, reler, repetir
e conferir leitura anônima negada. Remover o serviço temporário depois do recibo.

Não configurar o portal/worker para
consentir ou processar direitos com base no simples nascimento do livro. Ainda
exigir recuperação completa, conciliação atual, publicação seletiva, retenção,
monitoramento e gates do [fechamento](fechamento-plataforma-2026-11-16.md).

## Custódia real — 21/11

Bucket `a4570f3e-434f-4664-abba-322f790c2576`, nome S3
`recreio-direitos-producao-kzwh2c`, região sjc. Livro
`21cca46b-6522-4954-aa77-4b47de323193`, chave identificada como
`direitos-prod-20261121-1`. Esses identificadores não contêm o material MAC.
O custodiador `recreio-custodia-operacional` conserva 32 valores: os vinte
anteriores foram comparados como intactos e os doze novos coincidiram com a
cópia DPAPI separada do usuário. Não houve chave de produção no GitHub.

30512567 passou 44870680267: tipos, 66 testes, Docker, fronteira e recusa
implícita. O bundle de produção teve o mesmo SHA do GitHub. O serviço
temporário criou e releu o livro às 05:32 UTC, sem banco/login/Stripe, rede
pública, volume ou cron. 45d246c2 passou 44871671554 e sua execução real às
05:41 UTC confirmou livro existente: **um GET, zero tentativas de PUT**,
mesmo estado aberto/época zero/zero decisões e data original 05:32:42.758 UTC.
O checksum e os dois hashes de build estão no
[recibo operacional](evidencias/custodia-livro-producao-2026-11-21.json).

O provedor confirmou dois objetos/1.012 bytes. GET anônimo do cabeçalho real
e listagem anônima retornaram 403. O serviço temporário foi removido e sua
ausência conferida; custodiador e bucket permanecem. Portal conserva modos
de direitos/consentimento/encerramento/exportação ausentes com default off,
e cobrança off. Não houve consentimento, efeito pessoal, rotação ou publicação
de recuperação. Retenção/agenda/monitoramento do livro e recuperação completa
continuam pendentes; este recibo qualifica somente a custódia/inicialização.
