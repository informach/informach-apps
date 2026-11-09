# Sons do Morada

Biblioteca de efeitos, ambientes, voz inventada e música do Morada. Cada som existe em **OGG (Vorbis)** e **MP3**,
a **44,1 kHz**. Efeitos, ambientes e falas estão normalizados a **−16 LUFS**; as músicas, a **−20 LUFS**. O pico real
fica abaixo de **−1 dBTP**. Página para ouvir: `../sons_viewer/sons.html`.

O OGG é Vorbis, não Opus, porque o Opus decodifica sempre a 48 kHz e o pedido era 44,1 kHz. O MP3 é para o Safari
antigo; nos laços, prefira o OGG (veja "Laços").

## Pastas

| pasta | conteúdo |
|---|---|
| `interface/` | cliques, painéis, confirmar, cancelar, erro, notificação, dinheiro, nível, conquista, velocidade do tempo, modo construir |
| `casa/` | um som por animação de uso: banheiro, cozinha, portas e móveis, TV e computador, passos em 5 pisos (4 variações cada), quarto e limpeza |
| `bichos/` | cachorros pequeno, médio e grande, gatos, aves, leão, elefante e macaco |
| `ambientes/` | laços de 45 s (48 s no parque de diversões): bairro de dia, bairro à noite, centro, praia, parque, parque de diversões, chuva, vento |
| `voz/` | as falas em moradês, `boca.json` (boca por quadro) e `morada_voz.js` (o motor, para falar ao vivo) |
| `musica/` | 7 músicas, cada uma em `_inicio`, `_laco` e `_fim` |
| `sons.json` | índice de tudo (nome, grupo, duração, laço, origem, créditos, medidas) |
| `creditos.json` | os arquivos de terceiros usados (só CC0), com fonte, URL, autor e licença |
| `_conferencia.json`, `_conferencia.png` | medidas de cada arquivo e a folha de espectrogramas |

Os nomes terminados em `_laco` repetem sem emenda. `_kenney`, `_gravado`, `_gravada` e alguns bichos vêm de pacotes CC0
(o campo `origem` do índice diz qual); o resto foi sintetizado por código.

## Laços

Os laços foram feitos em modo circular: o ruído é periódico (gerado no domínio da frequência), os eventos que passam
do fim voltam ao começo, os filtros e a reverberação rodam em volta. Fim e começo se encaixam por construção. Os poucos
laços feitos de gravações CC0 foram fechados com um cruzamento de potência constante de 1 s.

No Web Audio, toque com `AudioBufferSourceNode.loop = true`. No teste da página (Chromium), OGG e MP3 decodificaram com o
número exato de amostras do original (o MP3 traz o cabeçalho do LAME com o atraso do codificador, e o navegador o
desconta). Se algum navegador deixar um silêncio na volta do MP3, use o OGG ou `loopStart`/`loopEnd`.

## Músicas: início, laço e fim

Cada música tem três arquivos com o mesmo ganho:
- `_inicio`: introdução curta. O campo `entrada_do_laco_s` do índice diz quando o laço deve entrar (o arquivo é mais
  longo porque leva a cauda das últimas notas, que soa por cima da entrada do laço).
- `_laco`: o corpo, de 65 a 82 s, um número inteiro de compassos (4/4, `bpm` no índice).
- `_fim`: cadência final. Toque no começo de um compasso do laço e pare o laço ali com uma rampa de ~80 ms.

```js
const t0 = ctx.currentTime + 0.05;
inicio.start(t0);
laco.loop = true; laco.start(t0 + entradaDoLaco);
// para terminar: próximo começo de compasso
const compasso = 4 * 60 / bpm;
const tFim = t0 + entradaDoLaco + Math.ceil((ctx.currentTime - t0 - entradaDoLaco) / compasso) * compasso;
fim.start(tFim); ganhoDoLaco.gain.linearRampToValueAtTime(0, tFim + 0.08); laco.stop(tFim + 0.1);
```

## Voz inventada (moradês)

Não usa palavras reais. O motor (`voz/morada_voz.js`, módulo ES sem dependências) monta frases com sílabas aleatórias
(semente) e sintetiza:
1. **Frase**: palavras de 1 a 3 sílabas (CV, V, CVC e alguns encontros como "bl", "tr"), com vogais a e é i o ó u ë e
   consoantes b d g p t k m n l r s z f v ch j h w. Uma lista impede palavras reais comuns e palavrões, em português e
   inglês. O tipo de frase (afirmação, pergunta, exclamação) sai da emoção.
2. **Segmentos**: cada fonema vira um trecho com duração, alvos de formantes, vozeamento e ruído (oclusivas com
   fechamento, soltura e aspiração; fricativas com ruído em banda; nasais com murmúrio; o tepe "r" curto).
3. **Entonação**: declinação ao longo da frase, acento na tônica e final que cai (afirmação), sobe (pergunta) ou sobe e
   cai (exclamação). Emoções mudam altura, faixa, ritmo, energia, sopro e inclinação espectral.
4. **Síntese**: fonte glotal com até 80 harmônicos (recorrência de Chebyshev), sopro, jitter e tremor; banco de 4
   formantes em paralelo que desliza entre os fonemas, mais o formante nasal e o ruído das fricativas.

Vozes: bebê, criança, adulto e idoso, masculina e feminina (altura, escala dos formantes, sopro, tremor no idoso).
Emoções: neutro, feliz, triste, bravo, surpreso, rindo e sono para criança, adulto e idoso; choro, balbucio e risada para
o bebê. A biblioteca tem 12 frases por combinação: `voz/<idade>_<sexo>_<emocao>_<nn>`.

Ao vivo, no navegador:

```js
import { falar, gerarFala, bocaNoInstante } from './sons/voz/morada_voz.js';
const fala = falar(ctx, { idade: 'adulto', sexo: 'f', emocao: 'feliz', semente: 42 }, destino);
fala.texto;        // "Bolasha nimé du!"  (para legenda)
fala.duracao;      // em segundos
// a cada quadro do jogo:
const { abertura, forma } = fala.bocaAgora();
```

`gerarFala(opts)` faz o mesmo sem Web Audio (devolve `amostras`, `taxa`, `duracao`, `boca`, `texto`); foi assim que o
Node gerou os arquivos desta pasta.

### Sincronizar a boca

Cada fala tem um envelope por quadro, a **30 quadros por segundo** (o mesmo ritmo das bibliotecas de animação):

```json
"adulto_f_feliz_01": { "fps": 30, "inicio_s": 0.006, "amp": [0, 0.21, 0.66, 1, ...], "forma": "XOOOFFOOOEMM..." }
```

- `amp[i]`: abertura da boca de 0 a 1 no quadro `i` (RMS do quadro, normalizado pelo percentil 95 da fala, com ataque
  imediato e soltura de ~60 ms, para a boca não tremer). Abaixo de 0,04 vira 0.
- `forma[i]`: a forma da boca do fonema no meio do quadro: `X` repouso, `M` fechada (m b p), `A` aberta (a é ó),
  `E` média (e ë e a maioria das consoantes), `I` estreita, sorriso (i s z), `O` redonda (o u w ch j), `F` dentes no
  lábio (f v).
- `inicio_s`: atraso do começo do áudio no arquivo (6 ms de silêncio antes do ataque). Para os arquivos, o quadro no
  instante `t` (segundos desde o `start`) é `floor((t - inicio_s) * fps)`. Para a fala ao vivo, `bocaAgora()` já faz a conta.

Ligação sugerida às formas de boca: escolha a peça do rosto pela `forma` e abra-a pela `amp` (por exemplo, a abertura da
peça `A` vai de fechada a 100% conforme `amp`). Entre quadros, interpole a `amp` (`bocaNoInstante` faz isso). Quando a
fala acaba, volte à expressão do humor.

## Conferência

`morada-art/sons_confere.py` mede os arquivos finais decodificados (OGG e MP3): duração, pico de amostra e pico real
(sobreamostragem 4×), loudness integrada (BS.1770-4, com os coeficientes oficiais de 48 kHz), silêncio no começo, estalo
nas bordas, saturação, DC e, nos laços, a emenda (salto de amostra contra o percentil 99 das diferenças, nível,
espectro e estalo agudo), comparada com cortes no meio do próprio arquivo (nas músicas, com os outros começos de
compasso). Tolerância de loudness: ±1 LU; abaixo de 400 ms a norma não define a loudness integrada, então o som inteiro
conta como um bloco e a tolerância é ±1,5 LU. Duas rodadas: `_conferencia_rodada1.txt` (71 com algo fora: atraso no
começo das falas, pico real em 4 arquivos, a medida das emendas de música) e `_conferencia_rodada2.txt` (nenhum).

## Origem dos sons e créditos

Só duas fontes: síntese por código (geradores `morada-art/sons_*.py` e o motor `sons_voz_motor.js`) e pacotes CC0 do
OpenGameArt (Kenney e outros autores). Cada arquivo de terceiros tem fonte, URL, autor e licença em `creditos.json`.
Itens com licença dupla, com origem de terceiros não conferível ou recortados de vídeos foram recusados.

## Como gerar de novo

Na pasta `morada-art`, com o ambiente `sons-venv` (numpy, scipy, matplotlib):

```
python -I sons_baixar.py fichas; python -I sons_baixar.py baixar <itens>    # pacotes CC0 (cada um numa pasta nova)
python -I sons_extrair.py <zip> <pasta nova>                                # só os arquivos de áudio
python sons_interface.py; python sons_casa.py; python sons_bichos.py
python sons_voz.py; python sons_ambientes.py; python sons_musica.py
python sons_confere.py 2; python sons_pagina.py
```
