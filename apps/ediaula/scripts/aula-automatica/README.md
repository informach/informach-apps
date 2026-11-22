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
- Sem o arquivo, `parte.sh … palco` abre a janela do palco na tela, por cima das outras, e espera a pessoa entrar à mão (até 10 min).

**Motor de transcrição no perfil do condutor.** O gravador transcreve a voz para gerar o plano. Sem o motor no perfil do condutor, o "Gerar plano do roteiro" não faz nada visível. Copie `%APPDATA%\ediaula\whisper` (binários e modelos) para `<perfil do EdiAula>\whisper`, ou instale a transcrição abrindo o EdiAula nesse perfil.

**Material da parte**, numa pasta por curso: `<material>/Aula N/Parte N - <título>/`.

| Arquivo | O que é | Obrigatório |
| --- | --- | --- |
| `Parte N - Áudio.wav` | a voz | sim |
| `Parte N - HeyGen.mp4` | a apresentadora em fundo verde, na resolução exportada (4K na Ilha), sem som: a voz entra pelo `Áudio.wav` | sim |
| `Parte N - Debinha 1.mp4` + `.wav` | personagens, com som | quando houver |

O título da pasta vira o nome do projeto e o título da capa. Um caractere que o Windows não aceita num nome (o "?" de "O que aparece quando você muda de lugar?") sai da pasta, e a capa o recupera do `## Parte N.` do roteiro.

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
5. **Aula sem Estúdio próprio.** Uma aula que demonstra o Estúdio de outro curso grava a tela na aula desse curso, no palco. Ponha na aula `"palco": {"slug": "...", "id": "...", "partes": {"<parte do roteiro>": "<sufixo do endereço>"}}`.
   - Exemplo: a Aula 6 do curso dos pais (`vilao`) grava a Parte 2 em `cade-todo-mundo`, Aula 1, com `?parte=4`. Essa parte abre com o jardim, Achados em zero e o Quando clicar ou tocar vazio.
   - **A própria plataforma, fora do palco** (a área dos pais, na Aula 7 do curso dos pais): `"palco": {"url": "<endereço da plataforma>", "partes": {"<parte>": "<caminho>"}}` e `"plataforma": {"contas": "<contas.json>", "porParte": {"<parte>": "<chave da conta>"}}`. O arquivo de contas (`{ "<chave>": { "email", "password" } }`) fica fora do git; `parte.sh … plataforma` entra na janela da aula com a conta da parte.
6. **Por curso, quando quem demonstra não é uma criança** (curso dos pais):
   - `"movimento": "professora"`: a mão do robô se move como a da professora. O padrão é `"crianca"`.
   - `"tempos": {"dwell": 0.4, "after": 0.5}`: os tempos do plano guiado, em segundos: `move` (Movimento), `dwell` (Antes do clique) e `after` (Após a ação). Sem eles, valem os do plano novo.
   - `"subtituloCapa"`: o subtítulo da capa. O padrão é o curso do EdiAula.
7. Perfis do EdiAula e do EdiSVG: o padrão é `~/EdiAula-teste/user-data` e `~/EdiSVG-teste/user-data`. Para usar outros, defina `AULA_PERFIL_EDIAULA` e `AULA_PERFIL_EDISVG`.
8. Confira o que cada parte resolve:

```bash
S=apps/ediaula/scripts/aula-automatica
$S/parte.sh farol 3 2 info
```

## O condutor

O condutor abre o EdiAula ou o EdiSVG licenciado no perfil de trabalho e recebe comandos por HTTP local. Rode na raiz do repositório e deixe aberto num terminal:

```bash
export npm_execpath="$(dirname "$(which pnpm)")/node_modules/pnpm/bin/pnpm.cjs"
node apps/ediaula/scripts/aula-automatica/condutor.mts ediaula   # porta 47998
node apps/ediaula/scripts/aula-automatica/condutor.mts edisvg    # porta 47999 (renders das peças e conferência)
```

O condutor usa o build de teste da suíte, que exige o pnpm fixado do repositório em `npm_execpath`. Sem essa variável, ele para com "Run native tests through the pinned pnpm workspace script". O `pnpm exec` não define a variável. Confira que o `pnpm.cjs` apontado tem a versão do `packageManager` do `package.json` da raiz.

Não abra o EdiAula ou o EdiSVG pelo `edi:work` com o condutor rodando: os dois usam o mesmo `apps/<ferramenta>/out`, e o build do `edi:work` derruba o condutor (ele perde a janela e as ações falham). Se acontecer, feche e abra o condutor de novo, sem `PROVA_SKIP_BUILD`.

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
| `renderizar-pecas.mjs` | no EdiSVG, abre e salva uma de cada vez as peças vinculadas que ainda não têm render |
| `limpar-anotacoes.mjs` | tira os destaques, as caixas, os balões e as peças da faixa "Marcações", para gerar de novo |
| `empacotar.mjs` | empacota o projeto aberto |
| `foto.mjs` | foto da janela |
| `quadro.mjs` | quadro composto como a exportação desenha |
| `ia.mjs` | chama uma ferramenta do EdiAula |
| `exportar-svg.mjs` | no EdiSVG, abre um `.edisvg` e exporta o MP4 (só para conferir quadros) |
| `entrar-na-plataforma.mjs` | entra na plataforma com uma conta de ensaio, na sessão da janela da aula (etapa `plataforma`) |
| `prints.mjs` | põe imagens no lugar de trechos da tela (`place_cutaway`, com transição) e destaques por cima delas |

## Gravar uma parte

```bash
$S/parte.sh farol 3 2 palco      # uma vez por perfil
$S/parte.sh farol 3 2 ensaio     # projeto novo, roteiro, voz, plano e ensaio seco
$S/parte.sh farol 3 2 gravar     # grava e registra os contornos em <parte>/edicao/caixas.json
$S/parte.sh farol 3 2 empacotar  # "Parte 2 - Projeto EdiAula.zip" na pasta da parte
```

**Regras da gravação:**
- **Gestos que mudam a plataforma** (ativar um presente, criar um perfil): só acontecem uma vez por conta, e o Verificar plano os faz de verdade. Faça o ensaio com uma conta e grave com outra, nova, com `comando.sh estado '{"semVerificar": true}'` antes do `gravar` (e `false` depois), para a gravação não rodar a verificação de novo.
- **Prints na edição:** o que o robô não grava (a área da criança vista por outra conta, a entrada com o código) entra por `prints.mjs` nos trechos `[na edição: …]`; passe esses trechos ao `montar` como animações, para o zoom não ampliar os prints.
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

**2. Escolher os trechos de animação.** Leia o `decisoes.txt` e marque cada trecho que vira animação, em segundos da aula. Bastante animação em toda parte, ilustrando tudo o que puder (Helena, 22/11/2026):
- **Parte de experiência:** inteira, do primeiro ao último segundo de fala, inclusive o "Na ilha…" e o convite ("Agora você vai investigar…", "O Zappy vai te mostrando…"), com o Zappy desenhado. A tela nunca mostra a experiência, nem ampliada nem no tamanho da aula.
- **Partes de blocos:** o que ensina ou recapitula (como o começo que relembra a experiência) e também as falas que explicam por que, para que ou o que acontece, com as artes do curso e os blocos recortados.
- **Fica na tela:** só a ação (arrastar, clicar, escolher, jogar) e a frase de instrução que abre ou fecha um trecho ("Deixe esse espaço à vista", "Olha aqui").

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

Animações de conceito que ainda não existem: uma cena por trecho, com `edicao/edisvg_cena.py`, como em `edicao/exemplos/farol-a3p2-conceitos.py` e `edicao/exemplos/farol-a3p5-conceitos.py`, salva em `<parte>/pecas/`.
- **Quadros do jogo:** recortes do jogo da gravação (como na Parte 5) mostram os avisos e as cenas de verdade. Quando a fala é de antes da mudança (os avisos originais), a faixa do aviso é redesenhada por cima com o texto original.
- **Base:** um `.edisvg` com o grupo "Jogo". Sem ele, `edicao/base_jogo.py <.edisvg com as artes> <base.edisvg>` monta a base a partir de um arquivo do curso que tem as artes do jogo como pranchetas (no Farol, o `animacao1.edisvg` da Aula 1).
- **Trechos "[na edição: …]" do roteiro:** o que o robô não grava, como em `edicao/exemplos/farol-a3p4-versoes-e-opcoes.py`.
- **Fontes:** só caracteres que as fontes da aula têm. Um símbolo como "▾" impede o render; desenhe-o.
- **Blocos:** os blocos de verdade saem da gravação com `edicao/recortar.sh <gravação> <segundo da voz> quadro q.png`, para medir, e depois com as coordenadas.
- **Numeração:** a peça `conceito-N` é a do N-ésimo trecho do `montar`, na ordem da aula. Ao acrescentar uma cena no meio, renumere as outras (e apague os renders antigos); fora de ordem, o relatório avisa "conceito-2 dura 10,6 s, o trecho dura 3,9 s".
- **Entrada com pop:** `c.mostra(no, t, pop=True)` respeita a escala do nó (um grupo em 0,4 fica em 0,4). Uma tecla apertada várias vezes leva todos os toques num `ilha_cena.aperta(c, tecla, (t1, t2, …))`: o EdiSVG aceita uma trilha só por propriedade, e o `validar_svg.py` acusa a repetida.
- **Personagem por cima:** a Debinha e o Dedé falam por cima da animação, à esquerda. Deixe a metade esquerda da cena livre nesse trecho (o que importa à direita do meio, longe da apresentadora) e a cabeça dela à vista.
- **Prévias:** o `exportar-svg.mjs` só abre a prévia se a janela principal do EdiSVG não estiver com uma peça vinculada. Depois de um `aplicar`, feche as janelas do EdiSVG e abra o condutor de novo antes de exportar prévias.
- **Validar:** confira com `edicao/validar_svg.py <pasta>`.
- **Uma fonte por cena:** depois de vinculada, a cena é editada no EdiSVG. O script não reescreve um `.edisvg` que já existe (`AULA_REFAZER_CENAS=1` reescreve e apaga o que foi feito lá). Os ids saem do nome do arquivo, então reescrever mantém o vínculo.
- **Nunca achatar:** a peça entra vinculada, não como MP4 ou PNG. O `exportar-svg.mjs` serve só para conferir quadros com o ffmpeg.

**4. Zoom, marcações e peças**

Os trechos estão em segundos da linha do tempo da edição, não do `Áudio.wav`: a narração entra no segundo em que a voz começou na gravação (0,3 a 0,5 s depois do começo nas partes que abrem com uma ação). `$S/parte.sh <curso> <aula> <parte> frases`, depois de gravar, dá cada frase já nesse segundo.

```bash
$S/parte.sh farol 3 2 montar '[[13.6,39.75],[100.0,106.6],[139.0,146.6],[175.8,206.1],[241.5,249.0]]'
```

Saem em `<parte>/edicao/`:
- `comandos.json`: o zoom, as marcações e a capa, com as peças de `pecas/` no lugar das anotações geradas;
- `comandos-apresentadora.json`: os intervalos em que a apresentadora aparece;
- `comandos-revisar.json` e `comandos-pecas.json`: o que vai para o relatório.

**5. No EdiAula**, com os condutores rodando:
1. Abra a cópia: `acao abrir-projeto.mjs '{"arquivo": "<cópia>"}'`. O `aplicar` age no projeto que estiver aberto: depois do `empacotar`, o aberto é o gravado, e sem este passo as marcações vão para ele. Confira o nome em `ia get_overview` antes de aplicar.
2. Importe as mídias pela janela de abrir: `acao importar.mjs '{"arquivos": [...]}'`. Use `/` nos caminhos do JSON.
   - a apresentadora (`Parte N - HeyGen.mp4`), posta em seguida com `ia add_clip` (no segundo 0 serve): o acabamento espera um clipe só dela e o põe no segundo em que a narração começa, para a boca acompanhar a voz;
   - a música. Ao importar, o EdiAula põe a música sozinho numa faixa "Voz", com o papel de professora: tire esse clipe (`ia remove_clips`), e o acabamento a distribui nas faixas de música;
   - os vídeos dos personagens. O vídeo do HeyGen vem sem som: junte antes com o `.wav` usando ffmpeg.
3. Ponha cada personagem no seu segundo: `ia add_clip '{"media_id": "...", "at": 100.0}'`. Cada fala usa o seu clipe.
   - Recorte o personagem só na fala, sem o silêncio das pontas: `ia trim_clip '{"clip_id": "...", "start": 173.5, "end": 175.8, "revision": N}'`.
   - Onde a fala está no vídeo: `ffmpeg -i "Parte N - Debinha 1.wav" -af silencedetect=n=-35dB:d=0.25 -f null -`. Ponha o clipe em (segundo da fala na aula − início da fala no vídeo). O segundo da fala na aula é o da linha do tempo (`parte.sh … frases`), não o da transcrição do `Áudio.wav`. Se a fala dela for mais longa que a da professora no mesmo lugar, comece logo depois da última palavra anterior, para não calar a professora na frase seguinte.
   - Às vezes a importação já põe os personagens e a música no começo da linha do tempo, na faixa "Voz": tire esses clipes e ponha cada um no seu segundo.
   - A revisão aparece no fim do `ia get_overview`.
4. Aplique o zoom, as marcações, a capa e as peças: `$S/parte.sh farol 3 2 aplicar`.
   - Cria as faixas "Zoom", logo acima da gravação, e "Marcações", acima do zoom.
   - As peças entram por **Arquivo › Importar animação do EdiSVG…**, vinculadas: 2 cliques no clipe abrem a peça no EdiSVG.
   - Rodar de novo não duplica a capa nem as peças.
   - Em seguida, as peças sem render são abertas e salvas uma de cada vez no condutor do EdiSVG (`acoes/renderizar-pecas.mjs`). Os pedidos de vínculo chegam juntos, e o EdiSVG só renderiza o último.
5. Paleta "Sistema Zero": `set_palette` com `fonts` e `mode: "apply"`.

**6. Acabamento.** Ainda com o projeto aberto:

```bash
$S/parte.sh farol 3 2 acabamento
```

Cada passo é uma ferramenta do EdiAula e um passo de desfazer:
- **`place_cutaway`:** as animações de conceito (peças `conceito-*.edisvg` vinculadas, ou mídias `conceito-*`) passam para a faixa da tela, no lugar do trecho, com a transição de círculos coloridos nas duas pontas. O som da página perde o mesmo trecho.
- **`move_clips`:** a apresentadora no segundo em que a narração começa (o HeyGen foi gerado sobre o `Áudio.wav`, então o segundo t do vídeo é o segundo t da voz).
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
- **Caixas das categorias:** numeradas (1 = categoria, 2 = item), pequenas, com a ponta na paleta. A 1 sai quando a 2 entra; a 2 fica 1,5 s (REGRAS.md). Valem os dois verbos do roteiro: `abrir categoria A > B` (Farol) e `categoria A`, um nível por gesto (Cadê). Um `categoria A` repetido em seguida só recolhe a mesma categoria e não ganha caixa.
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
- **Narração sem transcrição na cópia:** a verificação antes de exportar acusa "a fala do roteiro não está na aula", e a música não abaixa com a voz. Rode `ia transcribe '{"language": "pt"}'` antes da revisão.
- **Volume:** a aula sai perto de −25 LUFS. A normalização é uma opção da exportação ("Normalizar o volume"), marcada por quem exporta.
- **Jogo que perde uma tecla na gravação:** de vez em quando o jogo ignora uma tecla segurada (na Farol A3P3 de 17/11, o → que levava o personagem até a porta). Confira os quadros dos momentos de jogo antes de editar (o personagem chegou onde a fala diz?). Se não chegou, regrave: a tomada seguinte costuma sair certa.
- **Parte de experiência:** as animações usam as artes do jogo da base do curso, nunca quadros da experiência ampliada, que mostram para que lado cada número cresce (a descoberta da criança). Setas de x e y com duas pontas, como em `edicao/exemplos/farol-a3p6-conceitos.py`.
- **Aviso "fala do roteiro não está na aula" na fala de um personagem:** é a fala que o personagem diz no lugar da professora. Não precisa de correção.
- **Parte que começa com o projeto já enviado** (a do Mural, Farol A3P8): cada tomada do palco começa na própria parte, sem o envio da parte anterior, e o Compartilhar fica travado ("Envie o seu projeto primeiro"). Grave com uma cópia local do roteiro que tem `[enviar projeto]` logo depois do `[expandir estúdio]` (`roteiroLocal` no `config.json`, só durante o ensaio, a gravação e as decisões dessa parte). A primeira animação cobre o envio.
- **Exportar de novo o mesmo `.edisvg`:** com o arquivo já aberto no EdiSVG, `exportar-svg.mjs` exporta o que está aberto, sem reler o disco. Abra outro arquivo antes. Às vezes nem a troca por um arquivo só basta (na Farol A3P4, reabrir a cena 4 depois da 3 mostrou a versão antiga): confira o quadro e, se for o caso, abra mais um.
- **Contorno de "apontar bloco" num bloco empilhado:** o contorno é o do grupo do bloco no Blockly, que inclui os blocos encaixados embaixo dele. Num bloco do meio de uma pilha (Criar sprite farol em Ao iniciar), o destaque cobre o resto da pilha. Confira as fotos de `conferir/` e, se for o caso, troque o destaque por um `ia add_annotation` (`kind: highlight`, `box_width`, `box_height`, na faixa Marcações) só na linha do bloco, medida num `quadro.mjs` com o zoom.
- **Apontar logo depois de "mostrar blocos":** a área ainda pode andar depois de o contorno ser registrado, e o destaque cai uma linha fora (Farol A3P4, 4:05). O `montar.py` não destaca mais o próprio "mostrar blocos"; o apontar seguinte ainda precisa da conferência das fotos.
- **Vínculo que não entra no `aplicar`:** de vez em quando uma peça `.edisvg` não entra na aula ("a peça … não entrou na aula"), mas a mídia fica importada. Ponha o clipe com `ia add_clip` (`media_id` do arquivo salvo, `at` e `track_id` da faixa "Animações do EdiSVG") antes do acabamento, e tire a linha de `falhas` do `comandos-aplicado.json`.
- **O jogo some ao arrastar a área:** no palco, arrastar o espaço vazio da área de blocos para o jogo e esconde a prévia até a próxima mudança de bloco. É da plataforma (a tomada de 15/11 faz igual).
- **Botão clicado depois do último contorno registrado** (Reduzir, Próxima parte): o zoom e o balão usam o ponto do gesto no registro da gravação.
- **Trecho "[na edição: …]" com um vídeo pronto** (o jogo da demonstração da Farol A4P2): recorte o jogo do vídeo com ffmpeg sobre o fundo Azul jogo, com a faixa da direita livre para a apresentadora, e salve como `conceito-N-<nome>.mp4`. Importe, ponha com `ia add_clip` numa faixa de vídeo vazia e marque o trecho em `montar`. O acabamento trata o vídeo como animação de conceito. A revisão lista "peça sem vínculo": é esperado, porque é gravação de tela, não peça gráfica. Exemplo em `edicao/exemplos/farol-a4p2-conceitos.py`.
- **Pedaço de menos de 3 quadros entre a animação e a gravação:** a revisão apaga o pedaço e estica o clipe seguinte da mesma faixa sobre o espaço (antes ficavam quadros pretos, como em 0:19,9 da Farol A4P2).
- **Peça vinculada fica aberta numa janela própria do EdiSVG** (desde as várias janelas): cada pedido de vínculo do `aplicar` abre a peça num processo do EdiSVG com `--pedido`, que renderiza e continua aberto. A janela do condutor não consegue abrir essa peça ("Este projeto já está aberto em outra janela", e o `renderizar-pecas` e o `exportar-svg` dizem "não abriu"). Para refazer uma cena já vinculada: feche essas janelas (no Gerenciador de Tarefas, os `electron.exe` do `apps\edisvg` com `--pedido`), gere a cena de novo (`AULA_REFAZER_CENAS=1`), abra e salve no condutor do EdiSVG e espere o hash mudar no `vinculos.json` da pasta "<peça> · renders". A aula passa a usar o render novo sozinha. Para conferir quadros de uma cena antes de vincular, exporte uma cópia com outro `id` de projeto.
- **Condutor do EdiSVG depois de um processo encerrado à força:** com `PROVA_SKIP_BUILD=1` ele para em "editor não abriu". Abra sem essa variável (com o build).
- **Animação de conceito que começa debaixo da capa** (Ilha A1P1, o título sobre o jogo desde o "Oi"): a transição de círculos coloridos de entrada aparece no primeiro quadro, por cima da capa. Tire com `ia set_transition '{"clip_ids": ["<clipe da animação>"], "kind": "none"}'` depois do acabamento.
- **Jogo 3D:** os quadros do jogo da gravação servem para a cena do jogo; para personagens e objetos soltos, renderize os modelos do curso com fundo transparente (`edicao/exemplos/ilha-render-modelos.py`), como em `edicao/exemplos/ilha-a1p1-conceitos.py`. O script também tira a chave na medida por pixel do aventureiro e a vista de cima dos dois (Aula 2); as âncoras ficam em `ilha_cena.PE`. O PNG do Blender traz pedaços que o EdiSVG recusa (`tEXt`, `eXIf`, `pHYs`…); o script grava cada render só com IHDR, PLTE, IDAT, IEND, tRNS, sRGB e gAMA.
- **Rodar o `aplicar` de novo depois de uma peça travada multiplica as marcações e o zoom** (Ilha A1P4, 22/11/2026: cada destaque, caixa, balão e zoom saiu quatro vezes, espalhados pelas faixas depois do acabamento). Para destravar uma peça, tire só o clipe dela e rode `edicao/aplicar.sh` (que só vincula); se as marcações já duplicaram, refaça a edição numa cópia nova (`parte.sh … copia`) e aplique uma vez.
- **Janela de pedido encerrada à força deixa cópia de recuperação:** a janela seguinte com o mesmo número (o `recovery-v1-janela-<n>.json` do perfil do EdiSVG) pergunta se restaura e não abre a peça do pedido. Se a cópia for de um projeto vazio ("Sem título"), grave `{"version":1,"document":null}` no arquivo, que é o que o EdiSVG grava ao descartar.
- **Citação cuja última palavra a transcrição perdeu** (Ilha A2P2, 22/11/2026: "até perto da [chave]. Olha só"): o gerador do plano casava a citação com o "chave" da frase seguinte, e as setas iam para depois do "Olha só". Desde então a citação fica na sua frase, terminando na última palavra ouvida (`screenCues.ts`). Se um gesto aparecer na hora da frase seguinte, confira a transcrição do EdiAula no trecho.
- **Expandir o Estúdio com o projeto ainda abrindo** (Ilha A2P4 a A2P6, 22/11/2026): o `[expandir estúdio]` do começo da parte clicava em Expandir com a área de blocos ainda no esqueleto; a área expandida ficava sem nenhum bloco, o jogo fechava e o Verificar plano acusava "apontar prévia" e os gestos de bloco ("…blocklyDraggable não ficou visível"). O verbo do palco passou a esperar a área de blocos abrir (Sistema Zero bc0ec6c44): confira se o palco publicado já tem esse commit. Para ver a janela da aula durante o Verificar plano, fotografe o `webContents` de `http` mais novo pelo `ctx.app` (a janela fecha no fim).
- **Ensaio de novo numa parte já ensaiada:** o `novo-projeto` não reaproveita o nome; um segundo ensaio cria "<projeto> (2)", e o `parte.sh` (empacotar, copia) continua apontando o primeiro. Tire do caminho o projeto do ensaio sem gravação antes, ou vá direto ao `gravar`.
- **Uma coisa por vez no condutor do EdiAula:** gravação e edição usam o mesmo EdiAula. Um `gravar` que abre o projeto da parte no meio de uma edição tira o projeto da edição ("Nenhum projeto aberto no EdiAula" no `aplicar`; Ilha A2, 22/11/2026). Um lote de gravações em segundo plano não para com o fim do script que o chamou (no Windows, o `parte.sh … gravar` filho continua): encerre os filhos (`taskkill /T`) e reinicie o condutor, que é onde a ação corre.
- **Verde apagado no vídeo do HeyGen** (Ilha A2P5, 98 s; A2P6, 9 s): por um instante o fundo fica (32, 146, 42) em vez de (0, 159, 31), e o recorte padrão (limite 0,3 + suavidade 0,6) deixa um véu azulado em volta da apresentadora. Ache os trechos amostrando o canto do vídeo (força do verde abaixo de 0,9) e baixe a suavidade: `ia set_background_removal '{"media": "Parte N - HeyGen", "enabled": true, "color": "#009F21", "protect_clothes": 0.3, "softness": 0.3, "despill": 1}'` (o vídeo transparente leva 1,5× a duração para ficar pronto).
- **A câmera do jogo 3D esconde o que a fala mostra** (Ilha A2P2: a chave atrás da pedra): no roteiro, `[girar a cena para o outro lado N vezes]` gira pelos botões da vista do jogo num gesto só (verbo do palco). O Rodar de novo volta à vista do começo, então gire depois de rodar e, se houver setas, depois delas.
- **`validar_svg.py` aceita a peça ou a pasta** e sai com erro se não achar peça; antes, um arquivo no lugar da pasta respondia "ok" sem conferir nada.
- **Apresentadora à frente da voz** (Ilha A1P4, A2P2, A2P4, A2P5 e A2P6, até 22/11/2026): a narração guiada entra no `narrationOffset` da gravação (0,30 a 0,50 s nessas partes, que abrem com "expandir estúdio"), e o HeyGen, posto no segundo 0, mostrava a boca esse tanto antes da voz. O som do próprio HeyGen fica só 25 ms atrás do `Áudio.wav`, sem desvio ao longo do vídeo. Desde então o acabamento alinha a apresentadora com a narração, e a etapa `frases` dá os segundos da linha do tempo para as animações e os personagens, que também saíam adiantados quando vinham da transcrição do `Áudio.wav`. Para conferir uma edição pronta: no `.ediaula`, `start - in` dos clipes do HeyGen tem de ser igual ao `start` do clipe `narracao`.
- **Codificador sem memória no meio da tomada** ("Cannot allocate memory" do ffmpeg, Ilha A2P5): o gravador para na etapa e pergunta "Parar e salvar" ou "Descartar". Descarte (a tomada vai para a Lixeira e o projeto fica sem tomada) e grave de novo com a máquina mais livre.
- **Gravar numa sessão depois do ensaio:** o `gravar` carrega a parte pedida no estado do condutor (antes ele usava a do último ensaio: com as seis partes ensaiadas, o estado ficava na última), abre o projeto da parte, roda o Verificar plano e só grava se passar. Um projeto que já tem tomada é recusado: renomeie-o para "(tomada de …)" antes.
