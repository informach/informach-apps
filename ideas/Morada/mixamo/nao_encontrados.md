# Não encontrados

Clipes sem variante adequada no Mixamo. Para cada ID: termos buscados e os candidatos mais próximos, com o motivo de não servirem.

## IDs que reaproveitam outro clipe (decisão da Helena, sem arquivo próprio)

- `resident.sit.toilet` → usar o arquivo de `resident.sit.chair.idle` (Sitting Idle — "Sitting Still In A Chair").
- `resident.care.reach_down` → usar o arquivo de `resident.pickup.floor` (Picking Up — "Picking Up An Object").

## Observação sobre `resident.romance.propose`

Busca extra por transição de pé até um joelho (Stand To Kneel; Kneel; One Knee; Kneeling Down; Standing To Kneeling; Proposing): a única é `Kneeling Down` — "Standing To Kneeling Down", que termina com a mão apoiada no chão. Mantido `Kneeling` — "Kneeling On One Knee Idle".

## P0

### resident.sit.sofa.relaxed (AD ID TE CR)
- Termos: Sitting; Sitting Relaxed; Relaxed Sitting; Sitting Leaning Back; Lounging; Sitting On Couch; Slouch; Seated
- Candidatos:
  1. `Sitting Idle` — "Sitting With Breathing Idle" (pos 7 em "Sitting"): sentado em cadeira, inclinado para a frente, mãos nos joelhos. Não é largado.
  2. `Sitting` — "Sitting Looking Side To Side" (pos 18 em "Sitting"): sentado inclinado para a frente olhando para os lados. Ativo demais.
  3. `Sitting Idle` — "Sitting Reclined On The Floor" (pos 9 em "Sitting"): recostado apoiado nas mãos, mas no chão e com as pernas esticadas.

### resident.sit.floor.crossed (AD TE CR PQ)
- Termos: Sitting; Sitting On The Floor; Cross Legged; Sitting On Ground; Meditating; Meditation; Meditate; Seated Idle; Yoga; Sitting Floor; Indian Style
- Candidatos:
  1. `Sitting Idle` — "Sitting On The Floor" (pos 11 em "Sitting"): sentado no chão com os joelhos dobrados para cima e os braços sobre eles. Não cruza as pernas.
  2. `Sitting` — "Sitting Cross Legged" (pos 16 em "Sitting"): pernas cruzadas, mas sentado em altura de cadeira (uma perna sobre a outra).
  3. `Sitting Idle` — "Sitting Reclined On The Floor" (pos 9 em "Sitting"): no chão, mas recostado com as pernas esticadas.
  - `Seated Idle` (pos 1 em "Seated Idle") é sentado à mesa, com as mãos sobre ela; não serve.

### resident.sleep.exit (AD ID TE CR PQ)
- Termos: Waking; Getting Up; Getting Out Of Bed; Bed
- Candidatos:
  1. `Getting Up` — "Getting Up From Back" (pos 1 em "Getting Up"): levanta de deitado de costas, mas a partir do chão (atravessaria a cama).
  2. `Waking` — "Waking Up While Sitting" (pos 1 em "Waking"): acorda sentado no chão, pernas esticadas; não se levanta.
  3. `Lying Down` — "Laying Down On An Exam Table/Bed" (já baixado como resident.lie.enter): tocado ao contrário faria o "levantar da cama", se a engine permitir.

### resident.drink.sit (AD ID TE CR)
- Termos: Sitting Drinking; Drinking
- Candidatos:
  1. `Sitting Drinking` — "Having A Seat And Drinking A Can" (pos 1 em "Sitting Drinking"; 450 quadros): chega andando, senta e bebe. Só serve se for cortado na engine (o documento pede clipe inteiro).
  2. `Drinking` — "Male Drinking" (pos 1 em "Drinking"): bebe, mas de pé (já baixado como resident.drink.stand).

### resident.eat.sit (AD ID TE CR PQ)
- Termos: Eating; Sitting Eating; Eat; Food; Bite; Chewing; Snack
- Candidatos:
  1. `Sitting Drinking` — "Having A Seat And Drinking A Can": mão até a boca sentado, mas com lata e com caminhada antes.
  2. `Drinking` — "Male Drinking": mão até a boca, de pé.
  - O Mixamo não tem animação de comer.

### resident.wash (AD ID TE CR PQ)
- Termos: Washing; Washing Hands; Washing Face; Wash; Sink; Rubbing; Splash
- Candidatos:
  1. `Sitting Rubbing Arm` — "Sitting And Rubbing Arm": esfrega o braço, mas sentado.
  2. `Crying` — "Crying And Rubbing Eyes": mãos no rosto, mas é choro.
  - O Mixamo não tem animação de lavar as mãos ou o rosto.

### resident.carry.box.walk (AD TE CR)
- Termos: Walking With Box; Carrying; Box Walk
- Candidatos:
  1. `Box Walk Arc` — "Walking In A Left Arc Carrying A Box" (pos 1 em "Box Walk"): anda carregando a caixa, mas em curva para a esquerda, e o Mixamo não oferece In Place nesse clipe.
  2. `Jogging With Box` — "Jogging While Carrying A Box" (pos 9 em "Carrying"): carrega a caixa, mas trotando.

### resident.hug (AD ID TE CR PQ)
- Termos: Hug; Hugging; Embrace; Embracing; Hugging Someone; Comforting; Consoling
- Candidatos:
  1. `Patting` — "Patting On The Back" (pos 1 em "Patting"): tapinhas nas costas de alguém à frente; contato de afeto, mas sem abraçar (já baixado como resident.pat).
  2. `Shaking Hands 1` — "2 People Shaking Hands Part 1": interação de dois personagens, mas é aperto de mão.
  - O Mixamo não tem animação de abraço.

### resident.care.hold_idle (AD ID TE)
- Termos: Holding; Carrying Idle; Holding Baby; Carrying Baby; Cradling; Baby; Arms Crossed
- Candidatos:
  1. `Holding Idle` — "Holding An Object Idle" (pos 3 em "Holding"): parado segurando objeto, mas com os braços ao lado do corpo, não em berço.
  2. `Box Idle` — "Carrying A Box" (já baixado como resident.carry.box.idle): braços à frente, afastados na largura de uma caixa.
  3. `Tender Placement` — "Tenderly Placing Someone On A Bed" (pos 6 em "Bed"): braços em berço carregando alguém, mas é uma ação de deitar a pessoa na cama, não um idle.

### resident.care.rock (AD ID TE)
- Termos: Rocking; Cradle; Rocking Baby; Cradling
- Candidatos:
  1. `Dizzy Idle` — "Rocking Back And Forth As If Dizzy" (já baixado como resident.dizzy): balança o corpo, mas sem os braços em berço.
  2. `Box Idle` — "Carrying A Box": braços à frente, parado; não balança.
  - O Mixamo não tem animação de ninar.


## P1

### resident.baby.cry_sit (BB) — pedido extra
- Termos: Sitting Crying; Crying; Sad Sitting; Sitting Sad; Sitting Disbelief
- Candidatos:
  1. `Sitting Disbelief` — "Sitting In Disbelief With Head Back" (pos 2 em "Sitting Disbelief"): sentado, mãos no rosto e depois cabeça para trás; é descrença, não choro.
  2. `Sitting Disbelief` — "Sitting In Disbelief With Head Forward" (pos 3): mãos perto do rosto e tronco caindo para a frente; no bebê, quase tomba.
  3. `Crying` — "Crying And Rubbing Eyes" (já baixado como resident.baby.cry): chora, mas de pé.

### resident.romance.dance_slow (AD ID)
- Termos: Slow Dancing; Waltz; Slow Dance; Dancing Couple; Ballroom; Tango; Dancing
- Candidatos:
  1. `Rumba Dancing` — "Female Rumba Dancing - Loop" (já baixado como resident.romance.dance_rumba): ritmo lento, mas sozinho, sem pose de par.
  2. `Swing Dancing` — "Dance Swing Charleston": dança de salão, mas rápida.
  3. `Salsa Dancing` — "Salsa Dancing Side To Side": passo lateral, mais rápido que uma dança lenta.

### resident.device.use (AD ID TE)
- Termos: Working On Device; Tablet; Looking At Phone; Clipboard
- Candidatos:
  1. `Working On Device` — "Man Working On Device" (pos 1): ajoelhado mexendo em algo no chão, não segura o aparelho nas mãos.
  2. `Texting` — "Standing Texting On Phone" (já baixado como resident.text): aparelho nas mãos, mas é celular.

### resident.read.sit (AD ID TE CR) e resident.read.stand (AD ID TE)
- Termos: Reading; Sitting Reading; Reading Book; Book; Read; Holding Book; Newspaper
- Candidatos:
  1. `Texting` — "Standing Texting On Phone": olhar baixo para algo nas mãos, de pé (serve de base para "ler de pé" só com objeto pequeno).
  2. `Sitting Idle` — "Sitting Still In A Chair": sentado parado, sem livro.
  - O Mixamo não tem animação de leitura.

### resident.present (AD ID)
- Termos: Talking At Podium; Presenting; Explaining; Podium; Lecture; Speech; Teaching; Giving A Speech; Instructing; Explain
- Candidatos:
  1. `Talking` — "General Conversation" (já baixado como resident.talk.a): gesticula conversando, mas para uma pessoa.
  2. `Talking` — "Asking A Question With Two Hands" (já baixado como resident.talk.b): gestos abertos, parece explicar.
  3. `Standing Arguing` — "Standing Arguing With Another": gestos enfáticos, tom de discussão.

### Grupo J — cozinha e limpeza (busca rápida por ID)
- `resident.kitchen.stir` — Termos: Stirring; Cooking; Stir; Cook; Kitchen. Nada próximo.
- `resident.kitchen.chop` — Termos: Chopping; Cutting; Chop. Nada próximo (só golfe e carrinho de compras).
- `resident.clean.sweep` — Termos: Sweeping; Broom. Nada próximo.
- `resident.clean.mop` — Termos: Mopping; Mop. Nada próximo.
- `resident.clean.wipe` — Termos: Wiping; Cleaning; Wipe Table; Scrubbing; Dusting. Candidato mais próximo: `Wiping Sweat` — "Wiping Sweat Idle" (enxuga o suor da testa, não uma superfície).
- `resident.clean.vacuum` — Termos: Vacuuming; Vacuum. Nada próximo.
- `resident.laundry.fold` — Termos: Folding; Folding Clothes; Laundry. Candidato mais próximo: `Holding Idle` — "Holding An Object Idle" (segura algo parado, sem dobrar).

## P2

Nenhum ID do P2 ficou sem clipe. Ficam registradas as buscas em que o clipe não é exatamente o descrito, com os candidatos que havia:

### resident.fit.yoga (AD ID TE) — baixado `Arm Stretching`, sem ioga
- Termos: Yoga; Stretching; Yoga Pose; Meditating; Stretch. "Yoga" não retorna nada no Mixamo.
- Baixado: `Arm Stretching` — "Stretching Arms By Pushing The Elbows" (busca 'Stretching', pos 2): alongamento de braços, de pé.
- Outros candidatos:
  1. `Neck Stretching` — "Stretching Neck Rolling Side To Side" (busca 'Stretching', pos 1): só gira o pescoço.

### resident.climb.top (AD TE CR) — baixado `Freehang Climb`
- A busca 'Climbing To Top' só traz "Climbing Up A Ladder To Standing" (chega ao topo de uma escada de mão, não de uma borda).
- Baixado: `Freehang Climb` — "Freehang Climb To Standing" (busca 'Stand To Freehang', pos 3): de pendurado pelos braços, sobe para cima da borda e fica de pé. É o par de `resident.hang.enter`.
- Outros candidatos:
  1. `Climbing To Top` — "Climbing Up A Ladder To Standing" (busca 'Climbing To Top', pos 1).
  2. `Climbing` — "Pulling Up To A Ledge" (busca 'Ledge', pos 3).

### resident.garden.pick (AD ID TE CR) — fruta na altura dos olhos, não acima da cabeça
- As três variantes de `Pick Fruit` são: na altura dos olhos (pos 1, baixada), galho baixo (pos 2) e do chão (pos 3). Nenhuma colhe acima da cabeça.

### resident.play.jump_rope (TE CR) — sem opção In Place
- A lista pede IP, mas o Mixamo não oferece In Place em `Jumping Rope` (busca 'Jump Rope', pos 1). Baixado sem In Place; o clipe já pula no lugar. "Skipping Rope" não retorna nada.
