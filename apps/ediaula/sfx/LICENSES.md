# Efeitos sonoros do EdiAula: origem e licença

Os efeitos sonoros que acompanham o EdiAula são **obra própria**. Nenhum é gravado nem baixado: cada um é
calculado pelo código em `src/shared/soundEffects.ts`, a partir de números fixos e de um ruído de semente fixa,
então é o mesmo em qualquer computador, na prévia e na exportação. Não há arquivo de terceiros, atribuição
devida nem licença a pagar. Eles seguem a licença do próprio EdiAula e podem ir em qualquer aula exportada,
inclusive comercial.

O app grava os WAV em `Documentos\EdiAula\Efeitos sonoros` (48 kHz, 16 bits, mono) quando eles faltam
(`src/main/soundTrack.ts`). Todos são levados a cerca de −18 LUFS (BS.1770, sem gate, porque são mais curtos
que um bloco de 400 ms), sem passar de −1 dBFS de pico. Os mais curtos e espaçados, como `clique-mouse` e
`digitacao`, ficam um pouco abaixo de −18 LUFS para respeitar o pico.

| id | Nome | Grupo | Duração | Tags | Origem |
| --- | --- | --- | --- | --- | --- |
| `clique` | Clique | Cliques | 0,04 s | clique | próprio (sintetizado) |
| `clique-suave` | Clique suave | Cliques | 0,05 s | clique, suave | próprio (sintetizado) |
| `clique-mouse` | Clique de mouse | Cliques | 0,11 s | clique, mouse | próprio (sintetizado) |
| `clique-mecanico` | Clique mecânico | Cliques | 0,07 s | clique, tecla, teclado | próprio (sintetizado) |
| `pop` | Pop | Cliques | 0,09 s | pop, bolha, balão, aparecer | próprio (sintetizado) |
| `woosh-curto` | Woosh curto | Wooshes | 0,45 s | whoosh, woosh, transição, passagem | próprio (sintetizado) |
| `woosh-longo` | Woosh longo | Wooshes | 0,90 s | whoosh, woosh, transição, passagem | próprio (sintetizado) |
| `swoosh-entrada` | Swoosh de entrada | Wooshes | 0,50 s | whoosh, woosh, zoom, entrada | próprio (sintetizado) |
| `swoosh-saida` | Swoosh de saída | Wooshes | 0,50 s | whoosh, woosh, zoom, saída | próprio (sintetizado) |
| `ding` | Ding de acerto | Destaques | 1,20 s | sucesso, acerto, dica, sino | próprio (sintetizado) |
| `erro` | Erro | Destaques | 0,42 s | erro, falha, não | próprio (sintetizado) |
| `digitacao` | Digitação | Destaques | 1,25 s | digitação, teclado, escrever | próprio (sintetizado) |
| `tchan` | Tchan | Destaques | 1,10 s | comemoração, revelação, resultado | próprio (sintetizado) |
| `sucesso` | Sucesso | Destaques | 0,75 s | sucesso, acerto, publicação, pronto | próprio (sintetizado) |
| `comemoracao` | Comemoração | Destaques | 1,80 s | comemoração, vitória, festa, parabéns | próprio (sintetizado) |
| `notificacao` | Notificação | Destaques | 0,60 s | notificação, alerta, mensagem, aviso | próprio (sintetizado) |

## Sons da própria pessoa

Os sons que a pessoa guarda na biblioteca de todas as aulas como **Efeito sonoro** (Mídia › Todas as aulas)
também aparecem em `list_library`, com o id `lib:<id>`. A origem e a licença deles são de quem os trouxe: o
EdiAula não os altera nem os distribui.

## Ao acrescentar um som

1. Faça o som em `src/shared/soundEffects.ts` (sem arquivo de fora) e dê tags em português.
2. Suba `SOUND_VERSION`, para os arquivos e as faixas guardadas serem refeitos.
3. Acrescente uma linha nesta tabela. Um som de terceiros só entra com a licença dele registrada aqui, e só se
   ela permitir uso comercial sem atribuição na aula.
