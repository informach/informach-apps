# Servidor do Morada

Processo Node de longa duração que executa os mundos abertos do Morada, vários por instância, e fala com os clientes por WebSocket. A simulação é `@informach/morada-sim`; a identidade, o direito de entrar, a posse e a guarda dos mundos são do Recreio, alcançado só pela API das instâncias (`@informach/recreio/host`). Este servidor nunca lê as tabelas do Recreio.

Regras de domínio e contratos: [`packages/morada-sim/README.md`](../../packages/morada-sim/README.md) e [`packages/recreio/README.md`](../../packages/recreio/README.md). Estado da frente: [`docs/recreio/implementacao.md`](../../docs/recreio/implementacao.md).

## Rodar

```bash
# Desenvolvimento, sem portal nem banco: plataforma em memória, porta 3010.
MORADA_PLATAFORMA=falsa pnpm dev:morada-server

pnpm --filter @informach/morada-server typecheck
pnpm --filter @informach/morada-server test
pnpm --filter @informach/morada-server carga 20 10   # medida de bancada: mundos, minutos
```

No modo `falsa`, `POST /dev/entrar` com `{ "apelido": "Lia" }` devolve uma sessão de jogo, o id do mundo de desenvolvimento e o endereço do WebSocket. O primeiro apelido cria o mundo; os outros entram dividindo a família. Nada é salvo, e a configuração recusa este modo em produção.

## Variáveis

| Variável | Para quê |
| --- | --- |
| `PORT` | Porta HTTP e WebSocket. Padrão 3010 |
| `MORADA_PLATAFORMA` | `recreio` (padrão) ou `falsa` (só desenvolvimento) |
| `RECREIO_API_URL` | Origem do Recreio: API das instâncias e chaves públicas |
| `RECREIO_HOST_SECRET` | Segredo do jogo na API das instâncias (o mesmo de `RECREIO_HOST_SECRETS.morada` no Recreio) |
| `RECREIO_EMISSOR` | Quem emite as sessões de jogo. Padrão: a origem de `RECREIO_API_URL` |
| `MORADA_PUBLIC_URL` | Endereço público do WebSocket, igual ao cadastrado em `RECREIO_GAME_ORIGINS.morada.ws` |
| `MORADA_ORIGENS` | Origens de página que podem abrir o WebSocket, separadas por vírgula |
| `MORADA_CAPACIDADE` | Quantos mundos a instância aceita. Padrão 200 |
| `MORADA_METRICAS_TOKEN` | Segredo para ler `/api/metricas`. Sem ele a rota não existe |
| `MORADA_REGRAS` | `padrao` ou `prova` (gravidez e primeiras fases mais curtas) |

Em produção: `RECREIO_API_URL` em https, `MORADA_PUBLIC_URL` em wss, origens em https.

## Como funciona

- **`src/instancia.ts`**: os mundos abertos, as conexões, o limite de quadros por conexão e o batimento. Não sabe de WebSocket nem de relógio: recebe quadros de conexões abstratas e anda quando alguém chama `passo`. Em produção é o laço de 100 ms de `src/servidor.ts`; nos testes, o próprio teste.
- **`src/ator.ts`**: um mundo aberto. Abre reivindicando a posse, carrega a última fotografia e reaplica o diário; recebe intenções; anda; grava; fotografa; hiberna.
- **`src/servidor.ts`**: HTTP e WebSocket (`ws`), conferência de origem e de subprotocolo, ping, `/api/health`, `/api/ready`, `/api/metricas`.
- **`src/falhas.ts`**: pontos de queda para os testes.
- **`src/desenvolvimento.ts`**: a plataforma em memória do modo `falsa`.

O protocolo de mensagens fica em `@informach/morada-sim/protocolo`, para o cliente usar as mesmas formas.

## O que este servidor garante

1. **O que é crítico vai para o diário antes de qualquer cliente saber.** Um passo com fatos só é respondido e difundido depois de gravado. Se o diário não responde, o mundo espera; não avança nem avisa ninguém.
2. **Só escreve quem tem a posse.** Toda escrita leva a cerca. `POSSE_PERDIDA` faz o ator parar na hora, largar o estado e fechar as conexões com 4009. Sem batimento confirmado, o ator para sozinho 3 s antes do prazo local da posse, que conta da hora em que o último batimento foi enviado.
3. **O mundo volta de qualquer queda.** Ao abrir: fotografia mais os fatos do diário, aplicados pelo redutor da simulação. O que não é fato volta como estava na última fotografia, tirada a cada 30 s de mudança e logo depois de nascimento, casamento, mudança de família ou de fase.
4. **Mundo vazio não fica rodando.** Sem conexão e sem ninguém em espera, o mundo é fotografado, solta a posse e sai da memória.
5. **Fotografia ou hibernação que falham por indisponibilidade do Recreio não derrubam o mundo**: a tentativa se repete em 5 s.

Dentro do mundo, um jogador é o **id de membro** que o Recreio devolve na entrada, não o id do perfil. A sessão dentro da simulação é a própria sessão de jogo (`sid`), então reconectar com a mesma sessão retoma a reserva.

Fechamentos e o que o cliente faz com cada um estão em `FECHAMENTO`, no protocolo. Depois de 4009, 4010 e 4011 o cliente reabre o mundo pelo Recreio.

## Testes

Os testes usam a plataforma em memória de `@informach/recreio/testing` e conexões em memória, com o tempo controlado: cada passo é dado pelo teste.

| Arquivo | O que prova |
| --- | --- |
| `test/convivio.test.ts` | Duas contas no mesmo mundo e na mesma instância; cada uma dirige um morador; queda sem aviso; retomada; diário antes do aviso; hibernação e volta |
| `test/quedas.test.ts` | Instância derrubada e mundo recuperado em outra; desligamento ordenado; parto uma vez só nos três pontos de queda; instância congelada que volta e não escreve; parada antes de a posse vencer |
| `test/protocolo.test.ts` | Sessão inválida, vencida ou forjada; não membro; quadros fora do formato; excesso de comandos; comando repetido; sessão encerrada pelo Recreio; medidas |
| `test/rede.test.ts` | O servidor em uma porta de verdade, com clientes WebSocket de verdade: origem, subprotocolo, tamanho de quadro, conexão que some, saúde e desligamento |

## Ainda não tem

- Build para produção, serviço no Railway e Sentry (lote X3).
- Entrega da arte só para sessão de jogo válida (lote X2).
- Teste com o Recreio de verdade e com o processo morto por sinal (lote X1).
