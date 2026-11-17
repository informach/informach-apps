# Aula automática: gravar e editar uma parte

Este é o processo que transforma "grava a aula tal, parte tal" numa parte gravada e editada. O editor só confere e exporta.

**Etapas:**
1. **Gravação da tela pelo robô:** gravador guiado do EdiAula, no palco de gravação do Sistema Zero.
2. **Animações de conceito:** feitas no EdiSVG.
3. **Edição no EdiAula:**
   - apresentadora;
   - zoom;
   - destaques;
   - caixas das categorias;
   - balões;
   - capa;
   - música;
   - personagens.

As etapas são independentes:
- **Parte já gravada:** dá para fazer só a edição.
- **Refazer a edição:** substitui só a cópia de edição; o projeto gravado e os ajustes à mão ficam intactos.

O motor da gravação guiada é do próprio EdiAula. Veja "Gravação guiada" no [README do app](../../README.md). Esta pasta é o condutor e os scripts que ligam as etapas.

## O que a máquina precisa

**Programas:**
- este repositório com as dependências (`pnpm install`);
- Windows com Git Bash;
- Python 3.11 ou mais novo;
- `ffmpeg` e `ffprobe` no PATH;
- `curl`.

**Repositório do Sistema Zero** clonado. Os roteiros vêm de `docs/aulas-interativas/` na branch `staging`.

**Conta da equipe no palco de gravação da staging:** `https://palco-gravacao-staging.up.railway.app`.
- O e-mail e a senha ficam num arquivo local: e-mail na 1ª linha, senha na 2ª.
- Esse arquivo nunca entra no git.

**Material da parte**, numa pasta por curso: `<material>/Aula N/Parte N - <título>/`.

| Arquivo | O que é | Obrigatório |
| --- | --- | --- |
| `Parte N - Áudio.wav` | a voz | sim |
| `Parte N - HeyGen.mp4` | a apresentadora em fundo verde | sim |
| `Parte N - Debinha 1.mp4` + `.wav` | personagens | quando houver |

**Para as animações:**
- um `.edisvg` base do curso, com as fontes da aula e as artes do jogo numa cena com o grupo "Jogo";
- no Farol, a recapitulação da Aula 3 serve de base;
- o style guide "Zero Kids · Kit de slides".

**Para a edição:** a música de fundo do curso (no Farol, "Lighthouse Adventure").

## Configurar

1. Copie `config.exemplo.json` para `config.json`, na mesma pasta. O `config.json` fica fora do git.
2. Ajuste os caminhos desta máquina:
   - o clone do Sistema Zero;
   - o arquivo de credenciais;
   - a pasta de material de cada curso;
   - a música.
3. Os endereços das aulas no palco já estão no exemplo. Para um curso novo, copie um bloco e troque o `slug` e o `id` de cada aula.
4. Para usar uma cópia ajustada do roteiro no lugar da do Sistema Zero, ponha `"roteiroLocal": "<caminho>"` na aula. Isso serve, por exemplo, para uma citação que a transcrição escreve diferente.
5. Perfis do EdiAula e do EdiSVG: o padrão é `~/EdiAula-teste/user-data` e `~/EdiSVG-teste/user-data`. Para usar outros, defina `AULA_PERFIL_EDIAULA` e `AULA_PERFIL_EDISVG`.
6. Confira o que cada parte resolve:

```bash
S=apps/ediaula/scripts/aula-automatica
$S/parte.sh farol 3 2 info
```

## O condutor

O condutor abre o EdiAula ou o EdiSVG licenciado no perfil de trabalho e recebe comandos por HTTP local. Rode na raiz do repositório e deixe aberto num terminal:

```bash
node apps/ediaula/scripts/aula-automatica/condutor.mts ediaula   # porta 47998
node apps/ediaula/scripts/aula-automatica/condutor.mts edisvg    # porta 47999 (só para exportar animações)
```

Os dois podem rodar juntos, e na edição rodam juntos: o EdiAula do condutor manda os pedidos de vínculo para o perfil do EdiSVG do condutor, que gera os renders das peças. `PROVA_SKIP_BUILD=1` pula o build quando o código não mudou.

**Diálogos nativos:** são respondidos pela fila (`ctx.answer`); sem resposta na fila, abrem de verdade na tela. Fechar o app encerra o condutor.

**`comando.sh`** é a porta de entrada:

| Comando | O que faz |
| --- | --- |
| `comando.sh acao <ação.mjs> '<json>'` | junta o JSON ao estado e roda a ação |
| `comando.sh estado '<json>'` | só junta ao estado |
| `comando.sh js '<corpo>'` | roda um corpo de função com `ctx` |
| `comando.sh ia <ferramenta> '<json>'` | chama uma ferramenta do EdiAula, a mesma do assistente e do MCP |
| `comando.sh --svg …` | fala com o condutor do EdiSVG |

**Ações em `acoes/`:**

| Ação | O que faz |
| --- | --- |
| `abrir-projeto.mjs` | abre um projeto (`arquivo`) ou o último |
| `novo-projeto.mjs` | cria um projeto novo |
| `roteiro.mjs` | põe o roteiro no projeto |
| `fazer-parte.mjs` | gerar plano, ensaio seco e gravação |
| `entrar-no-palco.mjs` | entra no palco com a conta da equipe |
| `sonda-caixas.mjs` | registra os contornos dos alvos durante a gravação |
| `importar.mjs` | importa mídias pela janela de abrir |
| `salvar.mjs` | salva o projeto aberto |
| `aplicar.mjs` | faixas do zoom e das marcações, os comandos do `montar.py` e as peças `.edisvg` vinculadas |
| `acabamento.mjs` | animações na faixa da tela, planos da apresentadora, personagens, regra de voz, faixas e música |
| `revisao-final.mjs` | limpeza final, verificação antes de exportar e `relatorio.md` |
| `limpar-anotacoes.mjs` | tira os destaques, as caixas, os balões e as peças da faixa "Marcações", para gerar de novo |
| `empacotar.mjs` | empacota o projeto aberto |
| `foto.mjs` | foto da janela |
| `quadro.mjs` | quadro composto como a exportação desenha |
| `ia.mjs` | chama uma ferramenta do EdiAula |
| `exportar-svg.mjs` | no EdiSVG, abre um `.edisvg` e exporta o MP4 (só para conferir quadros) |

## Gravar uma parte

```bash
$S/parte.sh farol 3 2 palco      # uma vez por perfil
$S/parte.sh farol 3 2 ensaio     # projeto novo, roteiro, voz, plano e ensaio seco
$S/parte.sh farol 3 2 gravar     # grava e registra os contornos em <parte>/edicao/caixas.json
$S/parte.sh farol 3 2 empacotar  # "Parte 2 - Projeto EdiAula.zip" na pasta da parte
```

**Regras da gravação:**
- **Uma tomada por projeto:** para regravar, o `ensaio` cria um projeto limpo.
- **Ensaio antes de gravar:** só grave depois que o ensaio disser que todas as etapas passaram.
- **Etapa com problema no ensaio:** quase sempre é citação do roteiro que a transcrição escreveu diferente (use `roteiroLocal`) ou alvo fora da tela (falta um `[arrastar até "…"]` no roteiro).
- **Contornos para a edição:** os do `caixas.json` vêm da página da gravação. Os do ensaio não servem, porque a área se acomoda diferente.
- **Ações do roteiro:** ficam entre colchetes no "Na tela". A lista de verbos está no `ESPEC-ROTEIRO.md` do Sistema Zero. Antes do primeiro gesto, organize os blocos (`[organizar blocos]`). Centralize o bloco em que se mexe arrastando o espaço vazio (`[arrastar até "…"]`).

## Editar uma parte

A edição vai numa cópia do projeto gravado. As regras estão em [REGRAS.md](REGRAS.md), com o lugar em que cada uma é aplicada.

Deixe os dois condutores abertos: o do EdiAula e o do EdiSVG. O EdiSVG do condutor gera o render de cada peça `.edisvg` vinculada. Sem ele, o clipe fica no lugar, esperando o render.

**1. Decisões e cópia**

```bash
$S/parte.sh farol 3 2 decisoes   # <parte>/edicao/decisoes.txt: cada frase vira ação, explicação, conceito, fala ou personagem
$S/parte.sh farol 3 2 copia      # "<projeto> · edição automática.ediaula"
```

**2. Escolher os trechos de animação.** Leia o `decisoes.txt` e marque cada trecho de conceito que vira animação, em segundos da aula. Os trechos de conceito são:
- o que ensina ou recapitula, como o começo da parte de blocos que relembra a experiência;
- a parte de experiência inteira.

A frase de instrução que abre ou fecha um trecho ("Deixe esse espaço à vista", "Olha aqui") fica na tela.

**3. Peças `.edisvg`.** As peças gráficas prontas ficam em `<parte>/pecas/`. O nome diz o papel e a ordem:

| Arquivo | Lugar na aula |
| --- | --- |
| `capa[-<nome>].edisvg` | por cima dos primeiros 3 s |
| `caixa-01-programacao.edisvg` | a 1ª caixa das categorias |
| `destaque-03-bloco-se.edisvg` | o 3º destaque |
| `balao-02-<nome>.edisvg` | o 2º balão |
| `conceito-2-a-pergunta-certa.edisvg` | o 2º trecho de animação, no lugar da tela |
| `secao-01-<nome>.edisvg`, `encerramento[-<nome>].edisvg` | à mão: o relatório lista |

O que não vier em `.edisvg` é gerado pelo EdiAula no mesmo padrão e vai para a lista "criada sem .edisvg" do relatório.

Animações de conceito que ainda não existem: uma cena por trecho, com `edicao/edisvg_cena.py`, como em `edicao/exemplos/farol-a3p2-conceitos.py`, salva em `<parte>/pecas/`.
- **Blocos:** os blocos de verdade saem da gravação com `edicao/recortar.sh <gravação> <segundo da voz> quadro q.png`, para medir, e depois com as coordenadas.
- **Validar:** confira com `edicao/validar_svg.py <pasta>`.
- **Uma fonte por cena:** depois de vinculada, a cena é editada no EdiSVG. O script não reescreve um `.edisvg` que já existe (`AULA_REFAZER_CENAS=1` reescreve e apaga o que foi feito lá). Os ids saem do nome do arquivo, então reescrever mantém o vínculo.
- **Nunca achatar:** a peça entra vinculada, não como MP4 ou PNG. O `exportar-svg.mjs` serve só para conferir quadros com o ffmpeg.

**4. Zoom, marcações e peças**

```bash
$S/parte.sh farol 3 2 montar '[[13.6,39.75],[100.0,106.6],[139.0,146.6],[175.8,206.1],[241.5,249.0]]'
```

Saem em `<parte>/edicao/`:
- `comandos.json`: o zoom, as marcações e a capa, com as peças de `pecas/` no lugar das anotações geradas;
- `comandos-apresentadora.json`: os intervalos em que a apresentadora aparece;
- `comandos-revisar.json` e `comandos-pecas.json`: o que vai para o relatório.

**5. No EdiAula**, com os condutores rodando:
1. Abra a cópia: `acao abrir-projeto.mjs '{"arquivo": "<cópia>"}'`.
2. Importe as mídias pela janela de abrir: `acao importar.mjs '{"arquivos": [...]}'`.
   - a música;
   - os vídeos dos personagens. O vídeo do HeyGen vem sem som: junte antes com o `.wav` usando ffmpeg.
3. Ponha cada personagem no seu segundo: `ia add_clip '{"media_id": "...", "at": 100.0}'`. Cada fala usa o seu clipe.
   - Recorte o personagem só na fala, sem o silêncio das pontas: `ia trim_clip '{"clip_id": "...", "start": 173.5, "end": 175.8, "revision": N}'`.
   - A revisão aparece no fim do `ia get_overview`.
4. Aplique o zoom, as marcações, a capa e as peças: `$S/parte.sh farol 3 2 aplicar`.
   - Cria as faixas "Zoom", logo acima da gravação, e "Marcações", acima do zoom.
   - As peças entram por **Arquivo › Importar animação do EdiSVG…**, vinculadas: 2 cliques no clipe abrem a peça no EdiSVG.
   - Rodar de novo não duplica a capa nem as peças.
5. Paleta "Sistema Zero": `set_palette` com `fonts` e `mode: "apply"`.

**6. Acabamento.** Ainda com o projeto aberto:

```bash
$S/parte.sh farol 3 2 acabamento
```

Cada passo é uma ferramenta do EdiAula e um passo de desfazer:
- **`place_cutaway`:** as animações de conceito (peças `conceito-*.edisvg` vinculadas, ou mídias `conceito-*`) passam para a faixa da tela, no lugar do trecho, com a transição de círculos coloridos nas duas pontas. O som da página perde o mesmo trecho.
- **`set_crop` e `keep_ranges`:** a apresentadora com o recorte (esquerda, direita e topo 2%, base 45%), só nos intervalos, com dissolve.
- **`split_clip` e `set_clip_layout`:** o plano de cada trecho da apresentadora:
  - abertura;
  - demonstração;
  - animação de conceito, do começo ao fim dela;
  - cartão de seção.
- **`set_clip_layout`:** os personagens à esquerda, grandes, com dissolve.
- **`set_voice_rule`:** "personagem silencia a professora" ligada. A voz e o avatar dela saem enquanto o personagem fala.
- **`move_track`:** as faixas de baixo para cima: áudios, gravação, zoom, capa, marcações, apresentadora e personagens.
- **`spread_music`:** a música é distribuída com sobreposição de 3 s, fade e volume 0,15, em duas faixas marcadas como música, que abaixam com a voz.

O acabamento não repete o que já foi feito: as animações que já estão na faixa da tela ficam como estão.

Para refazer só as marcações:
1. `acao limpar-anotacoes.mjs '{"projeto": "<cópia>.ediaula"}'`, que tira também as peças vinculadas da faixa "Marcações";
2. `$S/parte.sh farol 3 2 aplicar --sem-zoom`;
3. o acabamento de novo.

**7. Limpeza final e relatório**

```bash
$S/parte.sh farol 3 2 revisao
```

O que a revisão faz:
- apaga os pedaços com menos de 3 quadros;
- troca o "Quadro estendido" pela gravação quando ela continua no trecho;
- confere os vínculos `.edisvg`;
- remove as faixas vazias;
- roda a verificação antes de exportar.

O resultado vai para `<parte>/edicao/relatorio.md`:
- as peças criadas sem `.edisvg`;
- o que precisa de revisão humana;
- os pontos da verificação;
- as fotos de cada marcação durante o zoom, em `edicao/conferir/`, para conferir se cada uma cai no bloco certo.

**8. Conferir e empacotar.** Reabra a cópia e confira os quadros: `acao quadro.mjs '{"quadros": [0.05, 60, 102]}'`. Os pontos para olhar:
- o primeiro quadro é a capa com a apresentadora à direita;
- o arrasto da paleta mostra a tela inteira;
- o zoom entra depois que o bloco cai;
- as caixas encostam na paleta, 1 e depois 2;
- os destaques caem no bloco certo;
- as animações têm a apresentadora por cima, do começo ao fim.

Depois empacote com `acao empacotar.mjs` e mova o .zip para a pasta da parte.

## Regras da edição (Helena, 16/11/2026)

O `decisoes.py` e o `montar.py` aplicam estas regras. A revisão de 17/11/2026 está em [REGRAS.md](REGRAS.md) e vale sobre estas onde as duas falam do mesmo ponto: faixas, zoom, caixas, destaques, peças `.edisvg`, planos da apresentadora, personagens e limpeza final.

**Apresentadora e tela**
- **Conceito:** ensinar ou recapitular vira animação do EdiSVG com as artes da aula, didática para criança.
- **Fala sem ação:** mostra a apresentadora.
- **Ação na tela** (arrastar, clicar, escolher): só a tela.
- **Blocos parados, só apontados com explicação:** a apresentadora aparece. O zoom deixa o bloco à esquerda dela. Quando o que se explica fica atrás dela, como o jogo à direita, ela sai.

**Capa e apresentadora no começo**
- A capa é o primeiro quadro, por cima da aula, sem acrescentar tempo e sem esmaecer.
- A apresentadora aparece desde o primeiro segundo.

**Zoom e destaques**
- **Zoom coerente:** o mesmo lugar fica ampliado, sem zoom-relâmpago.
- **Arrasto da paleta:** enquanto a mão pega o bloco na gaveta e leva até o lugar, a tela fica inteira. O zoom entra quando o bloco cai.
- **Destaque:** amarelo, no bloco mexido, quando o arrasto acaba. Bloco inteiro na primeira vez escurece o resto da tela; o encaixe vazio é azul (REGRAS.md).

**Caixas, balões e transições**
- **Caixas das categorias:** numeradas (1 = categoria, 2 = item), pequenas, com a ponta na paleta. A 1 sai quando a 2 entra; a 2 fica 1,5 s (REGRAS.md).
- **Balões:** explicam os botões clicados.
- **Transição:** círculos coloridos quando muda o contexto, como na entrada e na saída de uma animação.

**Animações**
- Seguem o style guide.
- A cena do jogo estende a cor da borda, nunca o branco.
- O personagem encosta de verdade na porta.
- Os blocos são os recortados da gravação.
- No máximo 3 caixas.
- Destaque amarelo no lugar de seta.

**Personagens e música**
- **Debinha e Dedé:** entram no ponto da tabela do roteiro, com a professora calada.
- **Música:** baixa, distribuída, com fade, sem competir com a voz.

## Limites conhecidos

- **Importação de mídia:** o `import_media` das ferramentas recusa arquivo que não foi escolhido na janela de abrir. Por isso a importação passa pelo botão Importar (`importar.mjs`).
- **Recorte de fundo:** o EdiAula liga sozinho o recorte de fundo em vídeo de fundo liso, como as animações. O acabamento desliga (`set_background_removal`).
- **Personagem no vídeo curto:** a busca automática da Edição kids pode não achar a fala no vídeo curto de um personagem. Nesse caso, ponha o clipe à mão no segundo da tabela, recortado na fala.
- **Animações por parte:** cada parte pede uma cena escrita para os seus conceitos, com os tempos das falas e os blocos recortados. O `edisvg_cena.py` dá as peças do style guide.
- **Leitura dos ids:** as ações de acabamento e de limpeza leem os ids no arquivo salvo e a revisão no `get_overview`. Salve antes de mexer à mão no meio do caminho.
