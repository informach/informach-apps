# Passo a passo: da voz e da apresentadora à parte editada

Este é o roteiro de trabalho para gravar e editar as aulas de qualquer curso pelo fluxo automático (Faísca e curso dos pais). Siga na ordem. Cada etapa diz o comando, o que conferir e o que fazer quando algo falha.

**Onde estão os detalhes:**
- os mecanismos (condutor, etapas do `parte.sh`, limites conhecidos): [README.md](README.md);
- as regras da edição: [REGRAS.md](REGRAS.md);
- a parte da plataforma (cadastro do curso, troca dos vídeos, adulto e produção): no Sistema Zero, em `docs/operations/cursos-passo-a-passo.md`.

O exemplo é o Moedas no caminho, Aula 1, preparado em 25/11/2026. Nos comandos, `S=apps/ediaula/scripts/aula-automatica`, rodando na raiz deste repositório, no Git Bash.

## Visão geral

| Etapa | Quem faz | O que sai |
| --- | --- | --- |
| 0. Roteiro pronto e curso cadastrado | Claude, no Sistema Zero | roteiro na `origin/staging` e aula com id no Kids de staging |
| 1. Vozes e apresentadora | Helena | mp3 do ElevenLabs e mp4 do HeyGen em `~/Downloads/<curso>` |
| 2. Bloco do curso no `config.json` | Claude | `parte.sh <curso> <aula> <parte> info` resolve tudo |
| 3. Pastas das partes | Claude | `preparar-pastas.py` |
| 4. Gravação no jeito | Claude | palco atualizado e condutor aberto |
| 5. Gravação da tela | Claude | `gravar-aula.sh`, que gera `Parte N - Projeto EdiAula.zip` |
| 6. Animações de conceito | Claude | `<parte>/pecas/*.edisvg` |
| 7. Edição | Claude | `editar-parte.sh` e `empacotar-edicao.sh`, que geram `Parte N - Edição automática.zip` |
| 8. Conferir e exportar | Helena ou o editor | o vídeo final |
| 9. Vídeos na plataforma | Claude, quando ela pedir | guia do Sistema Zero, Etapa 2 em diante |

**Uma coisa por vez:** gravação e edição nunca rodam juntas no mesmo condutor.

## 0. Antes de pedir as vozes

- **Partes curtas:** nenhuma parte passa de cerca de 850 palavras de fala. Meça no `<aula>.elevenlabs.txt`, dividido em `[long pause]`. Se passar, divida a parte antes de gravar.
- **Fim de cada aula:** a última montagem anuncia o quiz e termina em Próxima parte. O quiz é a última parte, não tem vídeo e termina em Concluir aula.
- **Roteiro validado:** `python3 docs/aulas-interativas-tecnico/validar-roteiros.py`, no Sistema Zero, sem erro.
- **Roteiro publicado:** o roteiro está na `origin/staging` do Sistema Zero. A pasta da parte cita esse commit.
- **Curso cadastrado no Kids de staging, com as partes atuais:** é a Etapa 1 do guia do Sistema Zero. O palco grava nessa aula: parte que não existe lá não grava.
  - Para ver o slug do curso e o id de cada aula, rode no Sistema Zero (só leitura): `bun scripts/cursos/cadastrar-curso.ts inspecionar --pasta docs/aulas-interativas/<app>/<curso>`.

## 1. O que a Helena entrega

Tudo vai numa pasta por curso em Downloads. Os arquivos podem ficar soltos nela ou dentro de `Aula 0N/`. No Moedas, a pasta é `~/Downloads/Poder - Moedas`.

- **Vozes da professora:** uma voz do ElevenLabs por parte com vídeo (`ElevenLabs_<data>_HelenaPro_….mp3`), gerada da fala da parte. A ordem dos arquivos não importa.
- **Voz do personagem:** um arquivo com todas as falas dele na aula, gerado do `<aula>.debinha.elevenlabs.txt` ou do `.dede.`. A voz da Debinha é a `DeboraPro`, e a do Dedé, a `AndrePro`.
- **Apresentadora:** um vídeo do HeyGen em 4K por parte com vídeo, `<cursoEdiAula>Aula0NParte0M_2160p.mp4`. A numeração conta só as partes com vídeo.
- **Personagem em vídeo:** `<cursoEdiAula>Aula0N<Debinha|Dede>_2160p.mp4`, com todas as falas da aula separadas por silêncio.

**Avatar sempre em 4K:** a apresentadora e o personagem nunca são recomprimidos. A única exceção é o corte do personagem, que obriga a recodificar; nesse caso, em qualidade alta e na mesma resolução.

## 2. O bloco do curso no config.json

O `config.json` fica fora do git. O `config.exemplo.json` tem o bloco de todos os cursos. Ao criar um curso novo, ponha o bloco nos dois arquivos.

```json
"moedas": {
  "nome": "Moedas no caminho",
  "cursoEdiAula": "PoderMoedas",
  "prefixo": "Moedas",
  "subtituloCapa": "Moedas no caminho",
  "slug": "jornada-faisca-poder-1",
  "material": "~/Downloads/Poder - Moedas",
  "aulas": {
    "1": {"id": "b57666c0-8b78-4c06-a498-3caf8a76f39b", "roteiro": "docs/aulas-interativas/faisca/poder-moedas-no-caminho/moedas-aula-1.roteiro.md"}
  }
}
```

| Campo | O que é |
| --- | --- |
| `cursoEdiAula` | o curso no EdiAula e o começo do nome dos vídeos do HeyGen. Se o HeyGen usar outro nome, ponha `"prefixoHeyGen"`. |
| `prefixo` | o começo do nome do projeto no EdiAula: `Moedas Aula01 Parte 1 <título>` |
| `subtituloCapa` | o subtítulo da capa de cada parte |
| `slug` e `id` | o curso e a aula no Kids de staging, na Etapa 0 |
| `material` | a pasta em Downloads |
| `musica` | a música da edição. Sem ela, vale a de cima, hoje a Lighthouse Adventure da pasta da Ilha. |

Confira com `$S/parte.sh moedas 1 1 info`. A saída mostra o nome do projeto, o endereço da aula no palco, a voz, a apresentadora, os personagens e a música.

## 3. Preparar as pastas das partes

```bash
python -X utf8 $S/preparar-pastas.py moedas 1 --conferir   # só mostra; não escreve nada
python -X utf8 $S/preparar-pastas.py moedas 1
```

**O que o script faz:**
1. **Lê as partes do roteiro.** Só as que têm "Fala para ElevenLabs" têm vídeo. A parte do quiz fica de fora.
2. **Casa cada vídeo do HeyGen com a voz de mesma duração.** O HeyGen é feito da voz, então a diferença fica em centésimos de segundo. Se nenhuma voz casar com um vídeo, ou mais de uma casar, o script para e lista as durações.
3. **Confere o texto de cada voz.** Transcreve a voz com o motor do perfil do condutor e compara com a fala do roteiro. "CONFERIR" com trechos diferentes de mais de duas palavras quer dizer que a voz foi gerada antes de o texto mudar:
   - se a parte toda mudou, a voz e o HeyGen dessa parte precisam ser refeitos;
   - se mudou uma frase só, dá para gravar a frase e emendar na voz (`edicao/emendas.json`, que o acabamento usa sem refazer o HeyGen).
4. **Corta o vídeo do personagem** no meio dos silêncios entre as falas, uma fala por parte, na ordem do roteiro.
5. **Cria as pastas** `Aula 0N/Parte M - <título>/`, cada uma com:
   - `Áudio.wav`;
   - `HeyGen.mp4`, sem som;
   - `Debinha 1.mp4` e `.wav`, quando a parte tem fala dela;
   - `Roteiro.md`;
   - `Falas.txt`;
   - `origem dos arquivos.txt`.

   Mídia que já está na pasta fica como está. Os textos são escritos de novo. Os originais em Downloads não mudam.

**Moedas, Aula 1 (25/11/2026):**
- 8 pastas, todas com a voz conferida contra o roteiro, de 96% a 100% das palavras;
- a Debinha nas Partes 1, 3, 4 e 7;
- a Parte 9 é o quiz, sem vídeo.

## 4. Deixar a gravação no jeito

1. **Palco atualizado.** O CI não publica o `palco-gravacao` da staging. Antes de gravar, compare o commit dele com a `origin/staging` e publique se estiver atrás. Rode de dentro de `~/projects/sistema-zero`, porque de outra pasta o CLI responde "Environment not found":

   ```bash
   railway deployment list -s a9c67d3c-9880-4707-bb16-22a5e7a52c30 -e f634cff6-aafb-4804-8b69-172fad4e946e --limit 1 --json   # meta.commitHash
   git fetch origin staging && git rev-parse origin/staging
   railway api 'mutation($s:String!,$e:String!,$c:String){serviceInstanceDeployV2(serviceId:$s,environmentId:$e,commitSha:$c)}' \
     --raw-var s=a9c67d3c-9880-4707-bb16-22a5e7a52c30 --raw-var e=f634cff6-aafb-4804-8b69-172fad4e946e --raw-var c=<sha da origin/staging>
   ```

   - O build leva cerca de 6 minutos. Espere o status SUCCESS antes de gravar.
   - O `redeploy` do MCP do Railway não serve, porque repete o build antigo.

2. **Condutor do EdiAula** aberto num terminal próprio, na raiz do repositório:

   ```bash
   export npm_execpath="$(dirname "$(which pnpm)")/node_modules/pnpm/bin/pnpm.cjs"
   node apps/ediaula/scripts/aula-automatica/condutor.mts ediaula
   ```

   - Não abra o EdiAula pelo `edi:work` com o condutor rodando, porque o build dele derruba o condutor.
   - Para a edição (etapa 7), abra também o condutor do EdiSVG: `condutor.mts edisvg`.

3. **Conta da equipe no palco.** O perfil do condutor (`~/EdiAula-teste/user-data`) guarda a entrada. Se o palco pedir para entrar, rode `$S/parte.sh <curso> <aula> 1 palco`, que abre a janela e espera a entrada à mão.

4. **Motor de transcrição no perfil:** `~/EdiAula-teste/user-data/whisper`. Sem ele, o plano não é gerado. Ele também serve à conferência da etapa 3.

## 5. Gravar a tela

```bash
$S/gravar-aula.sh moedas 1 1 2 3 4 5 6 7 8   # em segundo plano; leva mais ou menos o tempo das vozes, mais o ensaio
```

**Para cada parte, o script faz:**
1. **Ensaio:** cria um projeto novo, põe o roteiro e a voz, gera o plano e roda o Verificar plano.
2. **Gravação:** só se o ensaio disser "Todas as etapas funcionaram". São até 3 tentativas, e cada uma registra os contornos dos alvos.
3. **Sincronia:** `edicao/sincronia.py` mede em que palavra caiu cada gesto (tolerância de 0,15 s) e tira um quadro do jogo logo depois de cada gesto no jogo. Uma parte com gesto fora da palavra não é empacotada.
4. **Pacote:** gera `Parte N - Projeto EdiAula.zip` na pasta da parte.

**Registros, em `<parte>/edicao/`:**
- `ensaio.log`;
- `gravar.log`;
- `gravacao.log` (duração e verificação);
- `caixas.json` (contornos);
- `gravacao.txt` (a pasta da gravação no perfil);
- `sincronia.md` (cada gesto, a palavra do plano, a palavra em que aconteceu e o atraso) e `sincronia-jogo.jpg` (o jogo logo depois de cada gesto no jogo).

**Gesto na palavra e jogo fazendo o que a fala diz (Helena, 26/11/2026).** Ela viu, na Jardim A2, a fala dizer "pega o regador e depois vai na flor" e o personagem ir direto para a flor. Na Jardim A2P3, a seta de "pegue o regador" saiu 1,3 s depois, já em "personagem": o plano tinha as setas encavaladas com o toque anterior, e o executor faz uma etapa por vez. Por isso, depois de cada gravação:
- leia o `sincronia.md`: nenhum gesto fora da tolerância;
- olhe a `sincronia-jogo.jpg`: o jogo fez o que a fala diz em cada gesto (o esconderijo sumiu, o número mudou, o personagem pegou o item antes de chegar ao destino). Segurar uma seta por um tempo estimado não garante o caminho; quando o quadro mostra outro lugar, acerte o `[segurar tecla … por N s]` no roteiro e grave de novo;
- o jogo pronto sendo jogado num trecho `[na edição: …]` vai como animação do EdiSVG com as artes do jogo e cada toque na palavra (`edicao/exemplos/cade-conceitos-regravacao.py`, Aula 3, Parte 2), e não como clipe gravado à parte.

**Quando algo falha:**
- **O ensaio não passou:** quase sempre é uma citação do Na tela que a transcrição escreveu diferente. Use uma cópia do roteiro com `"roteiroLocal"` na aula. A outra causa comum é um alvo fora da tela: falta um `[arrastar até "…"]` no roteiro.
- **Gestos que mudam a plataforma só uma vez por conta** (ativar um presente, criar um perfil): veja as regras da gravação no README.
- **Regravar:** renomeie o projeto antigo para "(tomada de <data>)". O script não grava por cima de uma tomada.
- **Antes de editar, veja a gravação.** O jogo do palco já ignorou uma seta, de forma intermitente, e o personagem não chegou ao alvo.

## 6. Animações de conceito

**Regras:**
- as de [REGRAS.md](REGRAS.md);
- a parte de experiência é toda em animação, nunca a tela da experiência;
- o conceito que a parte de blocos relembra no começo também vira animação;
- vale o style guide "Zero Kids · Kit de slides";
- as animações usam as artes do jogo do curso;
- **direção de arte (Helena, 27/11/2026):** quem escreve as cenas age como diretor de arte e designer. O layout é caprichado, organizado, bonito e profissional, com um ponto de atenção por vez, alinhamento, respiro e figuras grandes. Antes de vincular, olhe os quadros com `edicao/previa_cena.py <cena.edisvg> <folha.jpg>` e acerte o que estiver feio. Os critérios estão em [REGRAS.md](REGRAS.md), seção 9.

**Script de cenas do curso.** Cada curso tem um, em `edicao/exemplos/<curso>-conceitos.py`. O modelo mais novo é o `jardim-conceitos.py`, com o `edicao/jardim_cena.py`; a Ilha tem um por parte.
- Ele gera `<parte>/pecas/conceito-K-<nome>.edisvg`.
- Cada cena se ancora numa frase da voz, com `tempos_da_voz.Voz`. Por isso o script roda depois de gravar: ele soma o atraso da narração.
- O script imprime o trecho `[ini, fim]` de cada cena, que é o que o `editar-parte.sh` recebe.

**Base:** um `.edisvg` com as fontes e as artes do jogo no grupo "Jogo". Para montá-la, use `edicao/base_jogo.py`, descrito no README.

**Kit:** monte as cenas com as peças de `edicao/kit_cena.py` (rótulo, linha, coluna, seta, anel, anotação, foco, selo, "+1", cartão, encaixar) e a mão do toque `edisvg_cena.mao_toque`. Elas já saem no tamanho, na cor, no respiro e no movimento do kit; não redesenhe essas peças no script do curso. A vitrine `edicao/exemplos/kit-vitrine.py` mostra todas.

**Prévia:** `python -X utf8 $S/edicao/previa_cena.py <cena.edisvg> <folha.jpg> 8 --grande` e olhe cada quadro como criança (REGRAS.md, seção 10).

**Validar:** `python -X utf8 $S/edicao/validar_svg.py <parte>/pecas`. Além do técnico, barra o desenho: texto em minúscula, fonte fora do kit, texto pequeno ou estourando a pílula, conteúdo na faixa da apresentadora, rótulos sobrepostos ou quase alinhados, quadro vazio, texto demais e cena parada. Só vincule com "ok". `--so-tecnico` é só para peça antiga que não vai ser refeita.

**Moedas (27/11/2026):** as duas aulas têm `edicao/exemplos/moedas-conceitos.py`, com as peças em `edicao/moedas_cena.py`.

**Aula 1 (o Farol 2D):** dezessete cenas, desenhadas na classe `Painel` com as artes do projeto do curso. Essas artes saem em PNG com `edicao/exemplos/moedas-artes-2d.py <moedas-2d.szproject.json> <blocos>`.
- A Parte 3, da experiência, é toda em animação, de ponta a ponta da fala.
- A Parte 2, do Passo a passo, mostra a tela.

**Aula 2 (a ilha 3D):** onze cenas, sempre onde a professora só explica:
- Parte 1: a regra que vem da Aula 1;
- Parte 2: o cofrinho, o grupo das moedas e o nome moeda;
- Parte 3: a cada quadro, e as moedas que já saíram da cena;
- Parte 4: a pergunta do baú, o "pelo menos 5" e a animação abrir;
- Parte 5: as duas respostas do aviso e o fecho.

**Renders e base:**
- Os renders saem de `edicao/exemplos/moedas-render-modelos.py`, rodado com o bpy de `~/blender-venv`: o aventureiro, a moeda e o baú fechado, abrindo e aberto, na mesma medida por pixel.
- A base é a do Jardim, que tem as mesmas fontes. As duas ficam em `<parte>/edicao/animacao/`.

## 7. Editar

```bash
$S/editar-parte.sh moedas 1 3 '[[12.4, 31.0], [40.2, 52.8]]'   # '[]' quando a parte não tem animação
$S/empacotar-edicao.sh moedas 1 3                             # depois de conferir o relatório
```

**O que o `editar-parte.sh` faz:**
1. **Monta os comandos** de zoom, destaques, balões e capa.
2. **Copia o projeto gravado** para "<projeto> · edição automática". A tomada e os ajustes feitos à mão ficam intactos.
3. **Põe na cópia a apresentadora, a música e o personagem.** O personagem entra no segundo da fala dele, sem calar a frase seguinte da professora (`edicao/personagem.py`, que lê o `Falas.txt`).
4. **Aplica os comandos** e pede ao EdiSVG o render de cada peça.
5. **Faz o acabamento:** planos da apresentadora, faixas e música.
   - **Vinheta final (Helena, 27/11/2026):** no último vídeo de cada aula (a última parte do roteiro com fala; o quiz do fim não conta), a vinheta entra na faixa da tela logo depois do último clipe, com o som dela. O arquivo é o `"vinhetaFinal"` do `config.json`, hoje `~/Downloads/vinheta-final.mp4` (4,4 s). Sem o arquivo, a edição avisa e segue.
6. **Transcreve e revisa,** e escreve `<parte>/edicao/relatorio.md`. Leia a seção "Para revisão humana".

**Refazer a edição:** rode de novo. Sai uma cópia nova, e a gravação não muda.

**Ajuste sem refazer tudo (Helena, 28/11/2026):** um ajuste refaz só a etapa que ele toca, nunca a parte inteira.
- **Uma ferramenta do EdiAula** (cursor, som de clique, um balão, a música): abra a edição pronta (`comando.sh acao abrir-projeto.mjs '{"arquivo": "<projeto> · edição automática.ediaula"}'`), chame só a ferramenta (`comando.sh ia set_cursor '…'`), salve (`comando.sh acao salvar.mjs`) e empacote. Leva segundos.
- **Do acabamento em diante** (apresentadora, faixas, vinheta, revisão, ou um acabamento que parou no meio): `editar-parte.sh <curso> <aula> <parte> '<trechos>' --desde acabamento`. Abre a edição pronta e não copia o projeto, não importa nem espera renders: cerca de 1 min em vez de 8.
- **Marcações** (zoom, molduras, balões que o `montar.py` decide): `editar-parte.sh` inteiro. As peças não são geradas de novo e os renders que já existem valem.
- **Uma cena:** `editar-kit.sh`. A cena que sai igual à que está na pasta não é regravada (`Cena.salvar` compara sem os ids sorteados), então só a cena que mudou renderiza de novo.

**Peça vinculada que não renderiza:** feche as janelas extras do EdiSVG, que ficam com as peças da parte anterior (veja "Limites conhecidos" no README). Desde 28/11/2026 o `parte.sh aplicar` fecha sozinho, depois dos renders, as janelas abertas para um pedido (`--pedido`); a do condutor fica.

O pacote sai em `Parte N - Edição automática.zip`, e o anterior vai para `Versão anterior/`.

## 8 e 9. Depois da edição

- **Conferir e exportar:** a Helena, ou o editor, abre o pacote no EdiAula, confere e exporta.
- **Levar os vídeos à plataforma:** segue o guia do Sistema Zero:
  - Etapa 2: trocar os vídeos provisórios pelos finais;
  - Etapa 3: copiar o Kids para o adulto;
  - Etapa 4: produção.

  Só quando ela pedir. O adulto e a produção vêm só depois de o Kids de staging estar todo conferido.

## Edição com o kit aprovado (27/11/2026)

O kit das animações foi aprovado no canvas (https://claude.ai/artifact/66TaKzk6pmBVA1HAjKa1mH). Toda parte reeditada usa:

- **Cenas** feitas com `edicao/kit_cena.py`: `titulo` (solto, com marca-texto), `zappy` + `balao_fala` (o balão do EdiAula), `cartao_texto`, `anotacao`, `moldura`, `anel`, `raios`, `icone`, `trilha`, `selo`, `mais_um` e a mão `edisvg_cena.mao_toque`. O fundo é o do curso: `Cena(..., fundo="fundo-cade")` (ver `edicao/artes/fundos_cursos.py`).
- **Abertura**: `edicao/capa_kit.py` gera `pecas/capa-abertura.edisvg` com a capa do curso (`edicao/artes/capa-<curso>.png`), o cartão verde com o título e o personagem chamando no balão; o `pecas.py` põe no lugar do template.
- **Tela gravada**: quando a fala nomeia uma coisa da interface, o roteiro aponta (`[apontar "Salvo"]`) e o `montar.py` dá zoom e a moldura amarela na palavra.
- **Um comando**: `./editar-kit.sh <curso> <aula> <parte> <script das cenas> <arte da capa> "<fala da abertura>"` gera as cenas e a abertura, valida (o validador barra desenho e contraste) e edita.
- **Zappy** é o de verdade, do EdiSVG: `zappy_kit.zappy_vivo(c, pose, x, y, altura, t0, t1, falas=[(ini, fim)])`, poses `falando`, `pensando`, `celebrando` e `alivio` em `edicao/artes/zappy/` (cópias de `sistema-zero/art/edisvg`). Entra como componente da cena; a boca mexe só nos trechos de `falas`. A ação `exportar-svg.mjs` marca a confirmação "exportar somente a timeline" que o EdiSVG pede para cena com componente.
- **Caixa-surpresa**: `kit_cena.caixa_surpresa(c, cx, base, t0, t1, chacoalha=[t...], abre=t)`.
- **O EdiSVG confere antes**: o `editar-kit.sh` roda `edicao/validar_edisvg.ts` (o `parseProject` e o `compileArtboard` do próprio EdiSVG, de `apps/edisvg` com `node_modules/.bin/tsx`). Peça recusada ali nunca vira render (ids duplicados, trilha sem objeto, mais de 256 deformações).
- **Personagem sem som**: quando o `Parte N - Debinha 1.mp4` vem sem áudio, o `editar-parte.sh` põe o `.wav` dele numa faixa "Voz · …". Confira no `acabamento.json` que a regra achou o personagem.
- **Regravar só a tela** quando a ação precisa mudar de lugar (o Expandir na frente da criança): roteiro local com o Na tela novo (`roteiroLocal` no config), renomear o projeto antigo para "(tomada de <data>)" e `./gravar-aula.sh <curso> <aula> <parte>`. A voz e o HeyGen continuam os mesmos.
