# Servidor do Morada

Processo Node de longa duração que executa os mundos abertos do Morada, vários por instância, e fala com os clientes por WebSocket. A simulação é `@informach/morada-sim`; a identidade, o direito de entrar, a posse e a guarda dos mundos são do Recreio, alcançado só pela API das instâncias (`@informach/recreio/host`). Este servidor nunca lê as tabelas do Recreio.

Regras de domínio e contratos: [`packages/morada-sim/README.md`](../../packages/morada-sim/README.md) e [`packages/recreio/README.md`](../../packages/recreio/README.md). Estado da frente: [`docs/recreio/implementacao.md`](../../docs/recreio/implementacao.md).

## Rodar

```bash
# Desenvolvimento, sem portal nem banco: plataforma em memória, porta 3010.
MORADA_PLATAFORMA=falsa pnpm dev:morada-server

# Ligado ao Recreio de verdade, com o portal no ar (`pnpm dev:recreio`):
cp apps/morada-server/.env.example apps/morada-server/.env   # ajuste o segredo
pnpm dev:morada-server

pnpm --filter @informach/morada-server typecheck
pnpm --filter @informach/morada-server test
pnpm --filter @informach/morada-server carga 20 10   # medida de bancada: mundos, minutos
```

`pnpm dev:morada-server` lê `apps/morada-server/.env` se o arquivo existir (ele é ignorado pelo git); o que já está no ambiente do terminal vale mais que o arquivo, então o comando do modo `falsa` acima continua funcionando com o `.env` no lugar. No modo ligado ao Recreio, três valores precisam bater com o ambiente do portal: `RECREIO_HOST_SECRET` é o segredo de `RECREIO_HOST_SECRETS.morada`, `MORADA_PUBLIC_URL` é a origem de `RECREIO_GAME_ORIGINS.morada.ws`, e `MORADA_ORIGENS` é a origem pública do portal. O passo a passo com as duas pontas está no [guia do portal](../recreio/README.md#morada-no-portal).

No modo `falsa`, `POST /dev/entrar` com `{ "apelido": "Lia" }` devolve uma sessão de jogo (`sessao`), quanto ela ainda vale (`validadeMs`), o id do mundo de desenvolvimento e o endereço do WebSocket. O primeiro apelido cria o mundo; os outros entram dividindo a família. Nada é salvo, e a configuração recusa este modo em produção.

| Rota | Corpo | Para quê |
| --- | --- | --- |
| `POST /dev/entrar` | `{ apelido, continuar?, validadeS? }` | Cada entrada abre uma sessão de jogo nova, que toma o lugar da anterior do mesmo apelido. Com `continuar: true`, devolve um token novo da sessão que o apelido já tem aberta: quem reabre o mundo depois de uma queda retoma a reserva. `validadeS` encurta a validade dos tokens da sessão, para testar a renovação sem esperar 15 minutos |
| `POST /dev/renovar` | `{ sessao }` | Troca um token que ainda vale por outro, da mesma sessão e com prazo novo (`{ sessao, validadeMs }`). `401` se o token não confere ou se a sessão já foi trocada por outra |

O cliente manda o token novo ao servidor do jogo com `renovar_sessao`, como faz com o SDK do Recreio. A bancada de `@informach/jogo-morada` renova sozinha a um terço da validade, então um jogo de desenvolvimento segue além dos 15 minutos. As rotas `/dev/*` só existem neste modo: com `MORADA_PLATAFORMA=recreio` o servidor responde `404`.

## Variáveis

| Variável | Para quê |
| --- | --- |
| `PORT` | Porta HTTP e WebSocket. Padrão 3010 |
| `MORADA_PLATAFORMA` | `recreio` (padrão) ou `falsa` (só desenvolvimento) |
| `RECREIO_API_URL` | Origem do Recreio: API das instâncias e chaves públicas |
| `RECREIO_HOST_SECRET` | Segredo do jogo na API das instâncias (o mesmo de `RECREIO_HOST_SECRETS.morada` no Recreio) |
| `RECREIO_EMISSOR` | Quem emite as sessões de jogo: a origem pública do portal (`NEXT_PUBLIC_APP_URL` dele). Padrão: a origem de `RECREIO_API_URL`; só é preciso dizer quando as duas diferem |
| `MORADA_PUBLIC_URL` | Endereço público do WebSocket, igual ao cadastrado em `RECREIO_GAME_ORIGINS.morada.ws`: só a origem (`wss://host` ou `ws://host:porta`), sem caminho. Com caminho, consulta ou credencial a configuração recusa |
| `MORADA_ORIGENS` | Origens de página que podem abrir o WebSocket, separadas por vírgula: a origem pública do portal, como o navegador a manda (sem barra no fim) |
| `MORADA_CAPACIDADE` | Quantos mundos a instância aceita. Padrão 200 |
| `MORADA_METRICAS_TOKEN` | Segredo para ler `/api/metricas`. Sem ele a rota não existe |
| `MORADA_REGRAS` | `padrao` ou `prova` (gravidez e primeiras fases mais curtas) |
| `LOG_LEVEL` | Nível do registro (`info` por padrão). Com `debug` aparecem também os batimentos e cada fotografia |

Em produção: `RECREIO_API_URL` em https, `MORADA_PUBLIC_URL` em wss, origens em https.

Um exemplo comentado do modo ligado ao Recreio está em [`.env.example`](.env.example).

## Ligado ao Recreio

- **Registro.** Ao subir, o servidor ouve a porta e tenta se registrar no Recreio. Se o portal ainda não está no ar, o processo **não cai**: `/api/health` responde 200, `/api/ready` responde 503, o WebSocket recusa conexões com 503, e o registro é tentado de novo a cada 2 s até dar certo. Recusa de configuração (`NAO_AUTENTICADO`: segredo errado; `ENTRADA_INVALIDA`: `MORADA_PUBLIC_URL` diferente de `RECREIO_GAME_ORIGINS.morada.ws`; `JOGO_INDISPONIVEL`) é tentada a cada 15 s, e a linha `registro_falhou` do registro diz o código e o que conferir, sem valor de variável.
- **O portal reinicia.** O registro fica no banco do Recreio, então a instância continua valendo. Enquanto ele não responde, os batimentos falham (`batimento_falhou`), cada mundo para sozinho 3 s antes do prazo da posse e, quando o Recreio volta, o batimento diz o que se perdeu. Se o Recreio deixar de conhecer a instância (`NAO_AUTENTICADO` no batimento), ela larga os mundos sem escrever, fecha as conexões com 4009 e se registra de novo.
- **Origem.** Neste modo só entra conexão com `Origin` igual a uma de `MORADA_ORIGENS`; quem não manda origem é recusado com 403. (No modo `falsa` e nos testes, conexão sem origem entra.)
- **Desligamento.** `SIGTERM` e `SIGINT` salvam os mundos, soltam as posses e fecham as conexões com 4010. No Windows um processo filho não recebe `SIGTERM`: quem o iniciou manda a mensagem `{ t: "encerrar" }` pelo canal do processo (`child.send`). Se esse canal fecha (quem iniciou foi embora), o servidor também desce.
- **Registro (log).** Uma linha de JSON por acontecimento, com `evento` e só ids de mundo, códigos e contagens: `instancia_registrada`, `mundo_aberto` (cerca, revisão, `novo`, `fatosReaplicados`, `diarioSeq`, `tick`), `jogador_entrou` (papel), `fotografia_gravada` (tipo, revisão, `diarioSeq`, `tick`, bytes), `batimento`, `posse_solta`, `mundo_hibernou`, `posse_perdida`, `diario_indisponivel` e `diario_voltou`. Nunca um token, o segredo, um perfil ou um apelido; `test/rede.test.ts` e o E2E do portal conferem.

O que o Recreio exige da instância e onde isso está no código:

| Regra do Recreio | No servidor |
| --- | --- |
| Registrar com o endereço de `RECREIO_GAME_ORIGINS.morada.ws` | `config.ts` reduz `MORADA_PUBLIC_URL` à origem; `instancia.iniciar()` |
| Reivindicar a posse quando o navegador conecta | `Ator.abrir()`, na primeira entrada em um mundo |
| Batimento com todos os mundos e o cursor | `instancia.batimento()`; o prazo local conta da hora em que o pedido saiu |
| Posse `perdida` no batimento | `Ator.perder()`: para sem escrever e fecha com 4009 |
| Parar 3 s antes do prazo, sem batimento confirmado | começo de `Ator.passo()` |
| `sessoesEncerradas` | `Ator.encerrarSessao()`: desconecta quem estava e libera também a reserva de quem estava em espera |
| Recuperar da fotografia mais `lerDiario({ apos: fotografia.diarioSeq })` | `Ator.abrir()` |
| Soltar a posse só com fotografia que cobre o diário | `Ator.hibernar()` e `Ator.encerrar()` fotografam antes de soltar |
| Fotografia até 4 MB; lote do diário até 256 kB e 256 entradas; `fatoId` até 160 | `Ator.gravarFatos()` divide o lote; os ids dos fatos da simulação têm menos de 100 caracteres; a fotografia do mundo da prova tem cerca de 5 kB |
| `CHECKPOINT_NECESSARIO` com 8 MB de diário sem fotografia | o mundo é fotografado logo ao passar de 2 MB; se ainda assim o Recreio exigir, `Ator.recomecar()` |

## Como funciona

- **`src/instancia.ts`**: os mundos abertos, as conexões, o limite de quadros por conexão e o batimento. Não sabe de WebSocket nem de relógio: recebe quadros de conexões abstratas e anda quando alguém chama `passo`. Em produção é o laço de 100 ms de `src/servidor.ts`; nos testes, o próprio teste.
- **`src/ator.ts`**: um mundo aberto. Abre reivindicando a posse, carrega a última fotografia e reaplica o diário; recebe intenções; anda; grava; fotografa; hiberna.
- **`src/servidor.ts`**: HTTP e WebSocket (`ws`), conferência de origem e de subprotocolo, ping, `/api/health`, `/api/ready`, `/api/metricas`.
- **`src/falhas.ts`**: pontos de queda para os testes.
- **`src/desenvolvimento.ts`**: a plataforma em memória do modo `falsa`.

O protocolo de mensagens fica em `@informach/morada-sim/protocolo`, para o cliente usar as mesmas formas.

## O que este servidor garante

1. **O que é crítico vai para o diário antes de qualquer cliente saber.** Um passo com fatos só é respondido e difundido depois de gravado. Se o diário não responde, o mundo espera; não avança nem avisa ninguém. Os passos que esperam ficam em fila, na ordem em que aconteceram: quem entra nesse meio tempo entra atrás deles e só recebe o mundo quando o diário confirmou tudo, quem sai e a sessão que o Recreio encerra esperam a vez, nenhuma fotografia é tirada e, no desligamento, a fila tem uma última tentativa antes da fotografia final. Se a tentativa falha, nada do que não gravou é guardado e a posse não é solta: outra instância recupera o que estava gravado quando ela vencer.
2. **Só escreve quem tem a posse.** Toda escrita leva a cerca. `POSSE_PERDIDA` faz o ator parar na hora, largar o estado e fechar as conexões com 4009. Sem batimento confirmado, o ator para sozinho 3 s antes do prazo local da posse, que conta da hora em que o último batimento foi enviado.
3. **O mundo volta de qualquer queda.** Ao abrir: fotografia mais os fatos do diário, aplicados pelo redutor da simulação. O que não é fato volta como estava na última fotografia, tirada a cada 30 s de mudança e logo depois de nascimento, casamento, mudança de família ou de fase.
4. **Mundo vazio não fica rodando.** Sem conexão e sem ninguém em espera, o mundo é fotografado, solta a posse e sai da memória.
5. **Fotografia ou hibernação que falham por indisponibilidade do Recreio não derrubam o mundo**: a tentativa se repete em 5 s.

Dentro do mundo, um jogador é o **id de membro** que o Recreio devolve na entrada, não o id do perfil. A sessão dentro da simulação é a própria sessão de jogo (`sid`), então reconectar com a mesma sessão retoma a reserva.

O **apelido** que o Recreio devolve na entrada vai para a presença do mundo, e é por ela que os outros jogadores sabem quem está, quem espera a volta e quem dirige cada morador. Para o servidor é texto de fora: entra sem caracteres de controle e cortado em `APELIDO_MAX`; se não sobra nada, a pessoa entra sem apelido. A presença não é gravada, então o apelido nunca vai para o diário nem para a fotografia, e é lido de novo a cada entrada.

Uma vez por segundo cada conexão recebe um `pulso`, depois do passo daquele instante, com o tick em que o mundo está. Enquanto um passo espera o diário, o pulso **continua saindo**, com o tick do último passo confirmado: o servidor está vivo e esperando, e os clientes ficam conectados sem ver nada de errado. Se a espera passa do prazo da posse, o mundo para e os clientes reabrem pelo Recreio.

A **sessão de jogo** vale até o `exp` do token mais a tolerância de relógio (5 s), a mesma conta para quem confere o token na entrada e para quem fecha a conexão vencida (`sessaoVencida`, em `@informach/recreio/contrato`). Um token aceito na entrada nunca é dado como vencido no mesmo instante.

Na **entrada**, só uma recusa de verdade do Recreio (não é membro, sessão encerrada, política) fecha com 4003, e só um token que não confere fecha com 4001. Recreio que não respondeu, na conferência da entrada ou na busca das chaves públicas (`chaves_indisponiveis` no registro), fecha com 4010, e o cliente reabre o mundo. Isso aparece no desenvolvimento: o `next dev` compila cada rota no primeiro pedido, e a primeira busca das chaves pode passar dos 5 s do prazo.

Se o Recreio recusar o diário com `CHECKPOINT_NECESSARIO`, a fotografia não pode ser tirada ali (a memória já tem o passo que não gravou). O ator larga a memória, fecha as conexões com 4010 e mantém a posse; quem reabre cai na mesma instância, que recarrega o que está gravado e fotografa antes de qualquer pedido. As outras recusas do diário que repetir não resolve (`FATO_DUPLICADO`, `SEQUENCIA`, `TAMANHO_EXCEDIDO`, `ENTRADA_INVALIDA`) têm o mesmo tratamento, com a linha `mundo_recomeca` no registro: o mundo nunca fica esperando para sempre um passo que o diário não vai aceitar.

Um mundo que volta com fatos do diário anda **um passo** antes de aceitar qualquer pedido. A simulação volta parada no tick do último fato, e o id de um fato leva o tick: sem esse passo, um pedido feito logo na volta (desmarcar o preferido que acabou de ser marcado, por exemplo) geraria um fato com o id de um que já está gravado.

Fechamentos e o que o cliente faz com cada um estão em `FECHAMENTO`, no protocolo. Depois de 4009, 4010 e 4011 o cliente reabre o mundo pelo Recreio.

## Testes

Os testes usam a plataforma em memória de `@informach/recreio/testing` e conexões em memória, com o tempo controlado: cada passo é dado pelo teste.

| Arquivo | O que prova |
| --- | --- |
| `test/convivio.test.ts` | Duas contas no mesmo mundo e na mesma instância; cada uma vê o apelido da outra; cada uma dirige um morador; queda sem aviso; retomada; diário antes do aviso; hibernação e volta |
| `test/quedas.test.ts` | Instância derrubada e mundo recuperado em outra; desligamento ordenado; parto uma vez só nos três pontos de queda; instância congelada que volta e não escreve; parada antes de a posse vencer |
| `test/pendente.test.ts` | O passo que espera o diário: a entrada de alguém não toma o lugar dele nem mostra o mundo antes da hora; saída e sessão encerrada esperam a vez; nenhuma fotografia nesse meio tempo; desligamento com o diário de volta e com ele fora do ar; fotografia antecipada com muito diário; `CHECKPOINT_NECESSARIO` |
| `test/protocolo.test.ts` | Sessão inválida, vencida ou forjada; não membro; quadros fora do formato; excesso de comandos; comando repetido; sessão encerrada pelo Recreio, conectada ou em espera; o vencimento com a tolerância de relógio; Recreio que não responde na entrada; o tick do pulso, com o mundo andando e com o diário fora do ar; medidas |
| `test/desenvolvimento.test.ts` | A plataforma do modo `falsa`: sessão renovada que passa dos 15 minutos e sessão que vence sem renovar; validade curta; continuar a mesma sessão ou abrir outra; as rotas `/dev/*` por HTTP e a ausência delas fora do modo |
| `test/rede.test.ts` | O servidor em uma porta de verdade, com clientes WebSocket de verdade: origem (e a origem exigida), subprotocolo, tamanho de quadro, conexão que some, saúde e desligamento; o registro que espera o Recreio subir e o que é refeito; nenhum token, perfil ou apelido no que é registrado |

Nos testes, o Recreio "fora do ar" falha como o cliente HTTP de verdade falha: `ErroDoRecreio("INDISPONIVEL")`.

Com o Recreio de verdade, o portal em build de produção, banco e o processo deste servidor morto por sinal, quem prova é o E2E do portal: `apps/recreio/e2e/morada.spec.ts` (`pnpm --filter @informach/recreio-app e2e`).

## Arte

Com `MORADA_ARTE_DIR` (a saída do empacotador `@informach/morada-arte`, sempre fora deste repositório), `src/arte.ts` entrega `/arte/<arquivo>`:

- só com uma sessão de jogo válida em `Authorization: Bearer`, conferida pelo mesmo verificador do WebSocket (o JWKS do Recreio, ou a plataforma em memória no modo `falsa`); sem ela, 401;
- só os nomes que o manifesto cita, mais o próprio `manifest.json`, comparados inteiros e sem decodificar; qualquer outro, 404;
- CORS só para `MORADA_ORIGENS` (no modo ligado ao Recreio, pedido sem `Origin` é recusado);
- pacotes com cache de um ano, privado e imutável (o nome leva o hash); manifesto revalidado pelo ETag;
- a cópia `.br` que o empacotador gravou para quem aceita brotli, com ETag próprio.

Tudo é lido para a memória na subida, e um manifesto que cita arquivo ausente impede a subida. Trocar a arte é reiniciar o processo. Sem a variável, a rota não existe e o cliente desenha os moradores procedurais.

```bash
ARTES_3D_DIR=<clone do artes-3d> pnpm --filter @informach/morada-arte empacotar -- --saida <pasta fora do repo>
MORADA_PLATAFORMA=falsa MORADA_REGRAS=prova MORADA_ARTE_DIR=<pasta> pnpm dev:morada-server
pnpm --filter @informach/jogo-morada bancada   # http://localhost:5173/?apelido=Lia&arte
```

No portal, a origem da arte é `RECREIO_GAME_ORIGINS.morada.assets` (`http://localhost:3010` em desenvolvimento).

## Ainda não tem

- Build para produção, serviço no Railway e Sentry (lote X3).
- Os passos de todos os mundos esperam uns pelos outros: uma chamada lenta ao Recreio em um mundo atrasa o passo dos outros mundos da instância.
