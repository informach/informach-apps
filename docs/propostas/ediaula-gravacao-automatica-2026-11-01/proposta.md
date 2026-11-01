# Gravação automatizada de aulas (EdiAula e Sistema Zero)

Pedido da titular em 01/11/2026: um robô que grave as aulas do Sistema Zero sozinho, seguindo o
roteiro, com o mouse de uma criança (suave, pairando antes do clique), que amplia e volta os
blocos, joga o jogo pronto, usa o livro, a experiência e o Estúdio, e mostra acelerado o tempo
que a plataforma leva para processar (como o Verificar projeto) e o que não cabe na fala.

Decisões dela: gravar no staging; notação leve entre colchetes no "Na tela"; esperas aceleradas
por padrão; fases 1 a 4 com piloto na Aula 1 do Cadê Todo Mundo; nada do que existe no Sistema
Zero pode mudar, então a gravação acontece num palco separado, serviço próprio no staging.

## Entregue no EdiAula (branch `ediaula/gravacao-automatica`)

| Lote | O que | Commit |
| --- | --- | --- |
| 1 | Movimento humano: arco, menor solavanco, passada em alvo pequeno, tempo pela lei de Fitts, rolagem suave até o alvo fora da vista | `5210bb09` |
| 2 | Esperas além da fala gravadas e aceleradas sob ela (tela sem voz), política por etapa, avisos no Verificar plano | `63f1a8af` |
| 3 | Plano gerado dos colchetes do roteiro, verbos do EdiAula e ponte `window.__gravacao` versão 1 | `f91b3953`, `8ca81ed3` |
| Review | Achados do full review independente | `f1289604` |

Contrato da ponte, verbos e comportamento: [README do EdiAula](../../../apps/ediaula/README.md#gravação-guiada-da-plataforma-web).

## Entregue no Sistema Zero (PR #233 para `staging`)

`packages/palco-gravacao`: a aula do Kids com o código do próprio Kids, só para a equipe, sem
salvar nada; ponte com os verbos do Sistema Zero; definição do serviço só no staging; roteiro da
Aula 1 do Cadê anotado e notação no `ESPEC-ROTEIRO.md`. Detalhes no README do pacote.

## Verificação

- EdiAula: typecheck, Biome e a suíte inteira (983 testes, 0 falhas); teste de fumaça em
  Electron 69 de 69, com uma página que tem a ponte.
- Palco: 12 testes, typecheck com todo o código do Kids que ele monta, build de produção, servidor
  local (entrada, healthcheck, bloqueio sem sessão); testes da configuração do Railway 35 de 35;
  validador de roteiros sem erros.
- Full review independente dos dois diffs, com os achados corrigidos.

## Pendências

- Criar o serviço no staging e fazer o merge do PR #233, nessa ordem (o gate do staging recusa
  criar serviço); o passo a passo está no README do palco. Depende da aprovação da titular.
- Piloto real: a voz da Aula 1, o login da equipe na janela da aula do EdiAula, Gerar plano do
  roteiro, Verificar plano contra o palco e a gravação. Ainda não houve teste com uma aula real.
- Lote 5 (montar o projeto pela solução) não foi feito: trocar campo, número e encaixar dentro de
  um bloco ainda são marcados à mão. Sem isso, o Verificar projeto da Aula 1 mostra o tempo real
  do servidor com o objetivo não cumprido.
- Limites conhecidos: vídeos da aula não são controlados; Estúdio em Python fora do palco; quiz
  no palco sempre passa; o jogo pronto sorteia como no Kids.
