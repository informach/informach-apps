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

Os dois podem rodar juntos. `PROVA_SKIP_BUILD=1` pula o build quando o código não mudou.

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
| `empacotar.mjs` | empacota o projeto aberto |
| `foto.mjs` | foto da janela |
| `quadro.mjs` | quadro composto como a exportação desenha |
| `ia.mjs` | chama uma ferramenta do EdiAula |
| `exportar-svg.mjs` | no EdiSVG, abre um `.edisvg` e exporta o MP4 |

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

A edição vai numa cópia do projeto gravado.

**1. Decisões e cópia**

```bash
$S/parte.sh farol 3 2 decisoes   # <parte>/edicao/decisoes.txt: cada frase vira ação, explicação, conceito, fala ou personagem
$S/parte.sh farol 3 2 copia      # "<projeto> · edição automática.ediaula"
```

**2. Escolher os trechos de animação.** Leia o `decisoes.txt` e marque cada trecho de conceito que vira animação, em segundos da aula. Os trechos de conceito são:
- o que ensina ou recapitula, como o começo da parte de blocos que relembra a experiência;
- a parte de experiência inteira.

A frase de instrução que abre ou fecha um trecho ("Deixe esse espaço à vista", "Olha aqui") fica na tela.

**3. Zoom e anotações**

```bash
$S/parte.sh farol 3 2 montar '[[13.6,39.75],[100.0,106.6],[139.0,146.6],[175.8,206.1],[241.5,249.0]]'
```

Saem `edicao/comandos.json` e `edicao/comandos-apresentadora.json`, que traz os intervalos em que a apresentadora aparece.

**4. Animações.** Uma cena por trecho, com `edicao/edisvg_cena.py`, como em `edicao/exemplos/farol-a3p2-conceitos.py`.
- **Blocos:** os blocos de verdade saem da gravação com `edicao/recortar.sh <gravação> <segundo da voz> quadro q.png`, para medir, e depois com as coordenadas.
- **Validar:** confira com `edicao/validar_svg.py <pasta>`.
- **Exportar:** com o condutor do EdiSVG rodando:

```bash
$S/comando.sh --svg acao exportar-svg.mjs '{"svgArquivo": "<x>.edisvg", "svgSaida": "<x>.mp4"}'
```

- **Conferir:** extraia quadros do MP4 com o ffmpeg antes de pôr na aula.

**5. No EdiAula**, com o condutor rodando:
1. Abra a cópia: `acao abrir-projeto.mjs '{"arquivo": "<cópia>"}'`.
2. Importe as animações (`acao importar.mjs '{"arquivos": [...]}'`) e ponha cada uma no seu segundo: `ia add_clip '{"media_id": "...", "at": 100.0}'`.
3. Aplique o zoom e as anotações: `edicao/aplicar.sh <parte>/edicao/comandos.json`.
4. Capa por cima dos 3 primeiros segundos, sem empurrar a aula:

```bash
$S/comando.sh ia add_template '{"template": "opening", "over_lesson": true, "duration": 3, "fields": {"kicker": "AULA 3 · PARTE 2", "title": "<título>", "subtitle": "<curso>"}}'
```

5. Paleta "Sistema Zero": `set_palette` com `fonts` e `mode: "apply"`.
6. Apresentadora:
   - `set_crop` com esquerda, direita e topo 0,02 e base 0,45;
   - `set_clip_layout` com x 0,857, y 1,0 e escala 1,58, do quadril para cima, sempre à direita.
7. Música: cópias da música a cada 90,2 s, alternando as faixas "Música" e "Música 2", com fade de 3 s e volume 0,15; marque as faixas como música (`set_audio music_tracks`), para abaixar sozinha com voz.
8. Personagens:
   - importe o vídeo com a voz;
   - o vídeo do HeyGen vem sem som, então junte com o `.wav` usando ffmpeg;
   - ponha no ponto da tabela do roteiro, com o clipe recortado só na fala (sem o silêncio das pontas).
9. Salve: `acao salvar.mjs`.

**6. Acabamento.** Com o EdiAula fechado (Ctrl+C no condutor):

```bash
python edicao/finalizar.py "<cópia>.ediaula" "<parte>/edicao/comandos-apresentadora.json"
python edicao/anotacoes.py acabar "<cópia>.ediaula"
```

O que muda no projeto:
- as animações passam para a faixa da tela, com a transição de círculos coloridos;
- a apresentadora aparece nos intervalos, menos nas falas dos personagens;
- a voz da professora fica calada enquanto um personagem fala;
- as caixas das categorias encostam na paleta;
- os zooms ficam numa faixa abaixo da apresentadora e acima das anotações.

Para refazer só as anotações: `anotacoes.py limpar`, `aplicar.sh comandos.json --sem-zoom` e `anotacoes.py acabar`.

**7. Conferir e empacotar.** Reabra a cópia e confira os quadros: `acao quadro.mjs '{"quadros": [0.05, 60, 102]}'`. Os pontos para olhar:
- o primeiro quadro é a capa com a apresentadora;
- o arrasto da paleta mostra a tela inteira;
- o zoom entra depois que o bloco cai;
- as caixas encostam na paleta;
- os destaques estão alinhados;
- as animações têm a apresentadora à direita.

Depois empacote com `acao empacotar.mjs` e mova o .zip para a pasta da parte.

## Regras da edição (Helena, 16/11/2026)

O `decisoes.py` e o `montar.py` aplicam estas regras:

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
- **Destaque:** amarelo, no bloco mexido, quando o arrasto acaba.

**Caixas, balões e transições**
- **Caixas das categorias:** numeradas, pequenas, com a ponta na paleta. A última sai quando a gaveta abre, para não cobrir o bloco que vai ser pego.
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

**O que ainda é feito por script, com o EdiAula fechado:**
- tirar clipes;
- pôr a animação na faixa da tela com a transição;
- encurtar as caixas;
- calar a narração.

Esses passos devem virar ferramentas do EdiAula.

**Outros limites:**
- **Importação de mídia:** o `import_media` das ferramentas recusa arquivo não escolhido na janela de abrir; por isso a importação passa pelo botão Importar.
- **Recorte de fundo:** o EdiAula liga sozinho o recorte de fundo em vídeo de fundo liso, como as animações; o `finalizar.py` desliga. No asset, `key: null` impede o projeto de abrir; o campo tem que sair.
- **Personagem no vídeo curto:** a busca automática da Edição kids pode não achar a fala no vídeo curto de um personagem. Nesse caso, ponha o clipe à mão no segundo da tabela.
- **Animações por parte:** cada parte pede uma cena escrita para os seus conceitos, com os tempos das falas e os blocos recortados. O `edisvg_cena.py` dá as peças do style guide.
