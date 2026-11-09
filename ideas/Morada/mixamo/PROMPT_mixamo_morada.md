# Tarefa: baixar do Mixamo as animações do Morada para 17 corpos

Você vai usar o Mixamo (mixamo.com), já logado na conta que eu te dei acesso, para aplicar animações a 17 personagens do jogo Morada e baixá-las como FBX. Siga este documento à risca. Se algo não estiver previsto aqui, pare e me pergunte antes de agir.

## 1. O que você recebe

O arquivo `morada_corpos_fbx_17.zip` tem 34 FBX, dois por corpo:

- `<corpo>_com_esqueleto.fbx`: **é este que você sobe no Mixamo.** Já vem com um esqueleto humanoide de 44 ossos que o Mixamo aceita sem auto-rig (testado no `adulto`).
- `<corpo>_so_malha.fbx`: só a malha. **Não use**, a não ser no caso de falha descrito no item 4.3.

Os 17 corpos e os grupos usados neste documento:

| Grupo | Código | Corpos (nome do arquivo) | Altura |
|---|---|---|---|
| Adultos | AD | `adulto`, `adulta`, `plus_m`, `plus_f`, `musculoso`, `atletica`, `alto_magro` | 1,74 a 1,93 m |
| Idosos | ID | `idoso`, `idosa` | 1,68 a 1,72 m |
| Adolescentes | TE | `adolescente_m`, `adolescente_f` | 1,61 a 1,64 m |
| Crianças | CR | `crianca_m`, `crianca_f` | 1,13 a 1,15 m |
| Crianças de 2–3 anos | PQ | `pequeno_m`, `pequena_f` | 0,84 a 0,86 m |
| Bebês de colo | BB | `bebe_m`, `bebe_f` | 0,66 a 0,68 m |

## 2. Regras que não podem ser quebradas

1. Suba só os arquivos `_com_esqueleto.fbx` deste zip. Não suba nenhum outro arquivo.
2. Os personagens são privados (licença de terceiros). Não publique, não compartilhe, não exporte para nenhum lugar além da pasta de saída.
3. Não compre nada, não mude configurações da conta, não apague personagens ou downloads que já estejam na conta.
4. Não baixe animações com armas, luta, morte, ferimento grave, jogos de azar ou conteúdo sexual. Se a busca trouxer uma dessas, pule.
5. Romance (beijo, dança de casal lenta, pedido de casamento) só para os grupos AD e ID.
6. Quando não achar um clipe adequado, **não invente nem force**: registre como "não encontrado" (item 7) com os 1 a 3 candidatos mais próximos.

## 3. Ordem de trabalho

1. Comece pelo corpo `adulto`. Para cada animação da lista (item 6), escolha a variante certa pela **prévia**, não só pelo nome: o Mixamo tem várias animações com o mesmo nome. Anote no manifesto qual escolheu (nome exato exibido, descrição curta da prévia e posição na lista de resultados).
2. Depois aplique **exatamente as mesmas escolhas** aos outros corpos do grupo que a animação atende. A ideia é que todos os corpos usem a mesma animação de origem, cada um com o ajuste de braço do seu corpo.
3. Faça por prioridade: **P0 para todos os corpos**, me entregue, depois **P1**, depois **P2**.
4. Se o site começar a limitar os downloads, espere e retome no ponto em que parou. O manifesto diz o que já foi feito.

## 4. Configuração no Mixamo

### 4.1 Subir o personagem

- Upload Character → arquivo `<corpo>_com_esqueleto.fbx`.
- O Mixamo deve mostrar o personagem já com esqueleto, sem pedir marcadores. Confirme que a malha aparece inteira e de pé.
- Faça um corpo de cada vez. Antes de trocar de corpo, confira se terminou todas as animações da prioridade atual para ele.

### 4.2 Ajustes da animação (painel da direita)

| Opção | Valor |
|---|---|
| Overdrive | Padrão do Mixamo, salvo indicação na lista |
| Character Arm-Space | Comece no padrão. Se, na prévia, as mãos ou os braços atravessarem o tronco, a barriga ou as coxas, aumente de 5 em 5 até parar de atravessar. Os corpos `plus_m`, `plus_f` e `musculoso` devem precisar de mais. **Anote o valor final por corpo e por animação** |
| Trim | Clipe inteiro (não cortar) |
| Mirror | Desligado |
| In Place | **Ligado** para as animações marcadas "IP" na lista; desligado nas demais |

Para as animações marcadas **"IP+RM"**, baixe duas vezes: uma com In Place ligado e outra desligado.

### 4.3 Se o upload falhar

Se o Mixamo recusar o `_com_esqueleto.fbx` ou abrir o assistente de auto-rig, **pare naquele corpo** e me avise, com o print da mensagem. Não use o auto-rig sem eu autorizar: ele troca o esqueleto e quebra a integração.

### 4.4 Opções de download (iguais para todos)

| Campo | Valor |
|---|---|
| Format | FBX Binary (.fbx) |
| Skin | **Without Skin** |
| Frames per Second | **30** |
| Keyframe Reduction | none |

## 5. Saída

### 5.1 Pastas e nomes

```
morada_mixamo/
  manifest.csv
  nao_encontrados.md
  <corpo>/
    P0/
      <id_interno>__<NomeMixamo>.fbx
      <id_interno>__<NomeMixamo>__inplace.fbx      (só nos casos IP+RM)
    P1/
    P2/
```

- `<NomeMixamo>`: o nome exibido pelo Mixamo, com espaços trocados por `_` (por exemplo `Sitting_Idle`).
- Se você usar duas variantes de mesmo nome para IDs diferentes, acrescente `_v2`, `_v3` ao nome do arquivo.
- Exemplo: `adulto/P0/resident.walk.normal__Walking.fbx`.

Entregue um zip por prioridade: `morada_mixamo_P0.zip`, `morada_mixamo_P1.zip`, `morada_mixamo_P2.zip`.

### 5.2 Manifesto (`manifest.csv`)

Uma linha por arquivo baixado, com estas colunas:

```
corpo,id_interno,nome_mixamo,variante_descricao,posicao_na_busca,in_place,arm_space,overdrive,frames,status,observacao
```

- `status`: `ok`, `ok_com_ajuste` (precisou mudar Arm-Space ou Overdrive) ou `ruim` (baixou, mas a prévia tem problema: pé deslizando, mão atravessando, pose estranha no corpo pequeno).
- `observacao`: o que viu de errado ou o que ajustou.

### 5.3 Não encontrados (`nao_encontrados.md`)

Para cada ID sem clipe adequado: o ID, os termos que buscou e os 1 a 3 candidatos mais próximos, com o motivo de não servirem.

## 6. Lista de animações

**Como ler:**
- **Busca**: termos para digitar no Mixamo, em ordem de preferência. Se nenhum servir, tente sinônimos em inglês.
- **Deve parecer**: o critério para escolher pela prévia.
- **Grupos**: quais grupos do item 1 recebem a animação. Os outros corpos não.
- **Op.**: IP = In Place ligado; IP+RM = baixar com e sem In Place; OD = ajuste de Overdrive indicado.

### P0: casa funcionando e o teste decisivo do jogo

#### A. Ficar de pé e se mover

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.idle.neutral | Breathing Idle; Idle | Parado respirando, braços relaxados, em loop | AD ID TE CR PQ | |
| resident.idle.happy | Happy Idle | Parado, alegre, leve balanço | AD ID TE CR PQ | |
| resident.idle.sad | Sad Idle | Parado, ombros caídos | AD ID TE CR PQ | |
| resident.idle.bored | Bored | Parado, entediado, mudando o peso | AD ID TE CR | |
| resident.idle.look_around | Looking Around; Looking | Olha em volta, curioso | AD ID TE CR PQ | |
| resident.walk.normal | Walking; Walk | Caminhada comum, ritmo médio | AD ID TE CR PQ | IP |
| resident.walk.happy | Happy Walk | Caminhada animada | AD TE CR PQ | IP |
| resident.walk.sad | Sad Walk | Caminhada lenta, cabisbaixa | AD ID TE CR | IP |
| resident.walk.old | Old Man Walk; Elderly Walk; Old Walk | Caminhada de idoso, passos curtos | ID | IP |
| resident.idle.old | Old Man Idle; Elderly Idle | Parado de idoso | ID | |
| resident.run.normal | Running; Run | Corrida comum | AD TE CR PQ | IP |
| resident.jog | Jogging | Trote leve | AD ID TE CR | IP |
| resident.turn.left | Left Turn; Standing Turn Left 90 | Gira 90° para a esquerda no lugar | AD ID TE CR PQ | IP |
| resident.turn.right | Right Turn; Standing Turn Right 90 | Gira 90° para a direita no lugar | AD ID TE CR PQ | IP |
| resident.stairs.up | Ascending Stairs; Walking Up Stairs | Sobe degraus de casa (não escada de mão) | AD ID TE CR | IP+RM |
| resident.stairs.down | Descending Stairs; Walking Down Stairs | Desce degraus de casa | AD ID TE CR | IP+RM |
| resident.crouch.enter | Stand To Crouch; Crouch | Agacha a partir de pé | AD ID TE CR PQ | |
| resident.crouch.idle | Crouch Idle | Fica agachado, parado | AD TE CR PQ | |
| resident.crouch.exit | Crouch To Stand | Levanta do agachado | AD ID TE CR PQ | |
| resident.pickup.floor | Picking Up | Pega algo do chão e se ergue | AD ID TE CR PQ | |
| resident.jump.small | Jump; Jumping | Pulinho no lugar | AD TE CR PQ | IP |

#### B. Sentar, deitar e dormir

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.sit.chair.enter | Stand To Sit | Senta numa cadeira a partir de pé | AD ID TE CR PQ | |
| resident.sit.chair.idle | Sitting Idle; Sitting | Sentado em cadeira, costas apoiadas, loop | AD ID TE CR PQ | |
| resident.sit.chair.exit | Sit To Stand; Standing Up | Levanta da cadeira | AD ID TE CR PQ | |
| resident.sit.sofa.relaxed | Sitting; Sitting Relaxed | Sentado largado, relaxado (sofá) | AD ID TE CR | |
| resident.sit.floor.crossed | Sitting (variante de pernas cruzadas) | Sentado no chão de pernas cruzadas | AD TE CR PQ | |
| resident.sit.toilet | Sitting (variante no vaso) | Sentado no vaso sanitário, sem gesto explícito | AD ID TE CR PQ | |
| resident.sit.legs_swing | Sitting (variante criança balançando as pernas) | Sentado, balançando as pernas | CR PQ BB | |
| resident.sit.talk | Sitting Talking | Conversa sentado | AD ID TE CR | |
| resident.sit.clap | Sitting Clap | Aplaude sentado | AD ID TE CR PQ BB | |
| resident.sit.laugh | Sitting Laughing | Ri sentado | AD ID TE CR | |
| resident.sit.angry | Sitting Angry | Bravo sentado | AD ID TE CR | |
| resident.lie.enter | Lying Down | Deita na cama a partir de sentado ou de pé | AD ID TE CR PQ | |
| resident.lie.idle | Laying Idle | Deitado de barriga para cima, acordado | AD ID TE CR PQ BB | |
| resident.sleep.idle | Sleeping Idle; Laying Sleeping | Dormindo deitado, respiração | AD ID TE CR PQ BB | |
| resident.sleep.exit | Waking; Getting Up | Acorda e levanta da cama | AD ID TE CR PQ | |
| resident.yawn | Yawn | Boceja de pé | AD ID TE CR | |

#### C. Necessidades

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.drink.stand | Drinking | Bebe de um copo, de pé | AD ID TE CR PQ | |
| resident.drink.sit | Sitting Drinking | Bebe sentado | AD ID TE CR | |
| resident.eat.sit | Eating; Sitting Eating | Come sentado à mesa, mão até a boca | AD ID TE CR PQ | |
| resident.dizzy | Dizzy Idle | Tonto, cansado demais | AD ID TE CR | |
| resident.stretch | Stretching; Arm Stretching | Espreguiça | AD ID TE CR | |
| resident.wash | Washing; Washing Hands; Washing Face | Lava as mãos ou o rosto numa pia | AD ID TE CR PQ | |

#### D. Casa e objetos

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.door.open_in | Opening Door Inwards; Open Door | Abre porta puxando para dentro | AD ID TE CR | |
| resident.door.open_out | Open Door Outwards | Abre porta empurrando | AD ID TE CR | |
| resident.cabinet.open | Opening | Abre armário ou gaveta à frente | AD ID TE CR | |
| resident.cabinet.close | Closing | Fecha armário ou gaveta | AD ID TE CR | |
| resident.button.push | Button Pushing | Aperta um botão (micro-ondas, interruptor) | AD ID TE CR | |
| resident.carry.box.idle | Box Idle; Carrying Idle | Parado segurando uma caixa | AD TE CR | |
| resident.carry.box.walk | Walking With Box; Carrying | Anda carregando caixa | AD TE CR | IP |
| resident.push.start | Push Start | Começa a empurrar algo pesado | AD TE CR | |
| resident.push.loop | Pushing | Empurrando, em loop | AD TE CR | IP |
| resident.push.stop | Push Stop | Para de empurrar | AD TE CR | |
| resident.search.pockets | Searching Pockets | Procura algo nos bolsos | AD ID TE | |
| resident.throw | Throw; Throwing | Joga algo leve (lixo, bola) | AD TE CR | |

#### E. Conversa e convívio

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.talk.a | Talking | Conversa de pé, gestos médios | AD ID TE CR | |
| resident.talk.b | Talking (outra variante) | Conversa com gestos diferentes | AD ID TE CR | |
| resident.talk.listen | Listening; Idle Listening | Escuta, com acenos leves | AD ID TE CR | |
| resident.wave | Waving | Dá tchau ou oi | AD ID TE CR PQ | |
| resident.greet | Standing Greeting | Cumprimenta ao chegar | AD ID TE CR | |
| resident.agree | Head Nod Yes; Agreeing | Concorda com a cabeça | AD ID TE CR PQ | |
| resident.disagree | Shaking Head No | Discorda com a cabeça | AD ID TE CR PQ | |
| resident.laugh | Laughing | Ri de pé | AD ID TE CR PQ | |
| resident.clap | Clapping | Aplaude de pé | AD ID TE CR PQ | |
| resident.cheer | Cheering; Victory | Comemora | AD TE CR PQ | |
| resident.point | Pointing | Aponta para algo | AD ID TE CR | |
| resident.phone.talk | Talking On Phone; On The Phone | Fala ao telefone, mão perto (não colada) da orelha | AD ID TE | |
| resident.text | Texting | Digita no celular | AD ID TE | |
| resident.look_behind | Looking Behind | Olha para trás | AD ID TE CR | |
| resident.handshake | Shaking Hands | Aperto de mão (anotar se é de um personagem só) | AD ID TE | |
| resident.pat | Patting | Dá tapinhas carinhosos (ombro, cabeça) | AD ID TE CR | |
| resident.hug | Hug; Hugging | Abraço (anotar se precisa de dois personagens) | AD ID TE CR PQ | |

#### F. O mínimo para casar e ter um bebê (teste decisivo)

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.romance.kiss_taller | Kiss (variante com parceiro mais alto) | Beijo curto e carinhoso em alguém mais alto | AD ID | |
| resident.romance.kiss_shorter | Kiss (variante com parceiro mais baixo) | Beijo curto em alguém mais baixo | AD ID | |
| resident.romance.blow_kiss | Blow A Kiss | Manda um beijo | AD ID | |
| resident.romance.propose | Kneeling; Kneel; Proposal | Ajoelha numa perna só (pedir em casamento) | AD ID | |
| resident.romance.propose_exit | Kneel To Stand; Standing Up From Kneel | Levanta do ajoelhado | AD ID | |
| resident.care.hold_idle | Holding; Carrying Idle; Holding Baby | Parado, braços em berço como se segurasse um bebê | AD ID TE | |
| resident.care.rock | Rocking; Cradle | Nina um bebê nos braços, balançando | AD ID TE | |
| resident.care.reach_down | Reaching Down; Picking Up | Abaixa e pega algo com as duas mãos (pegar bebê do berço) | AD ID TE | |
| resident.baby.crawl | Crawling; Crawl | Engatinha | PQ BB | IP |
| resident.baby.cry | Crying | Chora | PQ BB | |
| resident.baby.sit | Sitting (variante criança) | Sentado no chão, quieto | BB | |

### P1: família viva

#### G. Emoções

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.emote.cry | Crying | Chora de pé | AD ID TE CR PQ | |
| resident.emote.angry | Angry | Bravo, gesticulando | AD ID TE CR | |
| resident.emote.tantrum | Stomp; Angry Stomp | Bate o pé, birra | CR PQ | |
| resident.emote.scared | Scared; Terrified | Assustado | AD ID TE CR PQ | |
| resident.emote.surprised | Surprised | Surpreso | AD ID TE CR PQ | |
| resident.emote.excited | Excited | Empolgado | AD TE CR PQ | |
| resident.emote.disappointed | Disappointed | Decepcionado | AD ID TE CR | |
| resident.emote.thinking | Thinking | Pensativo, mão no queixo | AD ID TE CR | |
| resident.emote.thankful | Thankful | Agradece | AD ID TE CR | |
| resident.emote.pain | Pain Gesture | Dor leve (bateu a mão, cansaço) | AD ID TE CR | |
| resident.emote.reacting | Reacting | Reage a algo inesperado | AD ID TE CR | |
| resident.emote.relieved | Relieved Sigh | Alívio | AD ID TE | |
| resident.emote.shoved | Shoved | Leva um empurrão leve (esbarrão) | AD TE CR | |

#### H. Afeto e romance

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.romance.kiss_long_taller | Kiss (variante longa, parceiro mais alto) | Beijo mais longo, sem nada explícito | AD ID | |
| resident.romance.kiss_long_shorter | Kiss (variante longa, parceiro mais baixo) | Beijo mais longo | AD ID | |
| resident.romance.dance_slow | Slow Dancing; Waltz | Dança lenta de casal | AD ID | |
| resident.romance.dance_rumba | Rumba Dancing | Rumba | AD ID | |
| resident.romance.dance_salsa | Salsa Dancing | Salsa | AD ID | |

#### I. Escola, estudo e trabalho

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.desk.type | Typing | Digita sentado | AD ID TE CR | |
| resident.desk.write | Writing | Escreve sentado | AD ID TE CR | |
| resident.desk.point | Sitting And Pointing | Sentado, aponta para algo à frente | AD TE CR | |
| resident.device.use | Working On Device | Usa um aparelho nas mãos | AD ID TE | |
| resident.read.sit | Reading; Sitting Reading | Lê sentado | AD ID TE CR | |
| resident.read.stand | Reading (de pé) | Lê de pé | AD ID TE | |
| resident.present | Talking At Podium; Presenting; Explaining | Explica para um grupo (professor, reunião) | AD ID | |

#### J. Cozinha e limpeza (podem não existir: registre e siga)

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.kitchen.stir | Stirring; Cooking | Mexe uma panela | AD ID TE | |
| resident.kitchen.chop | Chopping; Cutting | Corta algo na bancada | AD ID TE | |
| resident.clean.sweep | Sweeping; Broom | Varre o chão | AD ID TE CR | |
| resident.clean.mop | Mopping | Passa pano no chão | AD ID TE | |
| resident.clean.wipe | Wiping; Cleaning; Wipe Table | Limpa uma superfície | AD ID TE CR | |
| resident.clean.vacuum | Vacuuming | Aspira | AD ID TE | |
| resident.laundry.fold | Folding; Folding Clothes | Dobra roupa | AD ID TE | |

### P2: cidade, lazer e profundidade

#### K. Jardinagem

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.garden.water | Watering | Rega plantas | AD ID TE CR | |
| resident.garden.dig | Digging | Cava | AD TE | |
| resident.garden.plant | Dig And Plant Seeds; Plant A Plant | Planta semente ou muda | AD ID TE CR | |
| resident.garden.pick | Pick Fruit | Colhe fruta no alto | AD ID TE CR | |
| resident.garden.pull | Pull Plant | Arranca mato | AD ID TE CR | |

#### L. Música, dança e brincadeira

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.music.piano | Piano Playing | Toca piano sentado | AD ID TE CR | |
| resident.music.guitar | Guitar Playing | Toca violão | AD ID TE | |
| resident.dance.silly | Silly Dancing | Dança engraçada | AD TE CR PQ | |
| resident.dance.samba | Samba Dancing | Samba | AD ID TE CR | |
| resident.dance.hiphop | Hip Hop Dancing | Dança hip hop | AD TE CR | |
| resident.swim | Swimming | Nada | AD TE CR | IP |
| resident.swim.tread | Treading Water | Boia parado na água | AD TE CR | |
| resident.play.jump_rope | Jump Rope; Skipping Rope | Pula corda | TE CR | IP |
| resident.play.videogame | Playing Video Game; Gaming | Joga videogame sentado | AD TE CR | |
| resident.play.ball_kick | Soccer Kick; Kick Ball | Chuta uma bola (brincadeira, não luta) | AD TE CR | |

#### M. Exercícios

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.fit.squat | Air Squat | Agachamento | AD TE | |
| resident.fit.jacks | Jumping Jacks | Polichinelo | AD TE CR | |
| resident.fit.pushup | Push Up | Flexão | AD TE | |
| resident.fit.curl | Bicep Curl | Rosca com haltere | AD TE | |
| resident.fit.crunch | Bicycle Crunch; Situps | Abdominal | AD TE | |
| resident.fit.yoga | Yoga; Stretching | Alongamento ou ioga | AD ID TE | |

#### N. Carro (só adultos)

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.car.enter | Entering Car | Entra no carro | AD ID | |
| resident.car.exit | Exiting Car | Sai do carro | AD ID | |
| resident.car.drive | Driving | Dirige sentado | AD ID | |

#### O. Escalar (cenários especiais)

| ID interno | Busca | Deve parecer | Grupos | Op. |
|---|---|---|---|---|
| resident.climb.ladder | Climbing Ladder | Sobe escada de mão | AD TE CR | IP+RM |
| resident.climb.rope | Climbing A Rope | Sobe na corda | AD TE CR | IP+RM |
| resident.hang.enter | Stand To Freehang | Pula e se pendura numa barra | AD TE CR | |
| resident.climb.top | Climbing To Top | Sobe de pendurado para cima de uma borda | AD TE CR | |

## 7. Conferência antes de entregar cada prioridade

Para cada corpo, confira:

1. Todos os IDs da prioridade que valem para o grupo dele foram baixados ou estão em `nao_encontrados.md`.
2. Os arquivos estão na pasta e com os nomes do item 5.1.
3. O manifesto tem uma linha por arquivo, com Arm-Space e status.
4. Nenhum arquivo é de animação proibida pelo item 2.

No fim de cada prioridade, me mande o zip e um resumo curto:
- quantos arquivos por corpo;
- quantos `ruim`;
- os IDs não encontrados;
- os corpos em que o Mixamo deu problema.

Observação esperada: nos bebês (BB) e nas crianças de 2–3 anos (PQ), várias animações vão parecer estranhas, porque o Mixamo foi feito para proporções adultas. Baixe assim mesmo o que estiver na lista desses grupos, marque `ruim` quando for o caso e descreva o problema. Eu ajusto depois.
