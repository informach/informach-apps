# Ligação dos programas gráficos sem coleta extensa por sucesso

A rodada privada `43829572152`, fonte `0872a4bb`, separou a entrada e a
reconexão: 54 consultas somaram 11.774,7 ms na entrada; 45 somaram 16.709,2 ms
na reconexão, que falhou no botão Decorar, com prazo de 15 s preservado. O custo
aparece em Standard e Lambert, com e sem mapa/skinning. Decoração/restauração
nos dois formatos e as 48 prévias passaram, apesar da falha independente.

No [Three.js fixado](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLProgram.js),
o primeiro uso busca três logs completos antes de consultar LINK_STATUS,
inclusive em sucesso. A [documentação](https://github.com/mrdoob/three.js/blob/r186/docs/pages/WebGLRenderer.html)
prevê desligar essa coleta em produção para ganhar desempenho. Não basta retirar
a detecção: a candidata deve validar estritamente a ligação de cada programa.

Implementação:

- `cena/programas.ts`: guardião de recursos, valida cada programa uma vez e
  só memoriza sucesso. False, valor desconhecido ou exceção não admitem o recurso.
- `Cena`: usar `renderer.debug.checkShaderErrors=false` com validação própria
  de LINK_STATUS. Conferir todos os programas após compileAsync, antes de admitir
  o preparo; conferir programas novos depois do desenho. Falha interrompe a cena
  e usa o aviso de preparação existente. Não alterar materiais, arte, simulação,
  agendamento, prazos de interação ou orçamento do bundle. O handle desconhecido
  dos tipos do Three é conferido em execução, sem cast.
- Uma consulta de ligação por programa substitui a coleta de três logs de
  sucesso. Logs extensos de sucesso deixam de ser coletados; erro de ligação
  continua sendo recusado. Não editar dependências nem mudar o driver do teste.
- Unidades conferem admissão, descarte da falha e programas novos; uma página
  isolada da bancada compila shaders válidos e inválidos com WebGL real para
  provar a recusa. Nenhum método de teste entra na API do jogo.
- O observador privado passa a medir também LINK_STATUS, sem alterar seu valor;
  repetir a jornada por etapas com a mesma arte/configuração, inspecionar imagens
  e conservar as falhas. Se o custo só mudar de chamada, não declarar resolvido.

Gates pesados somente no GitHub. Sem ativação de D3 ou prova de FPS em hardware
real; o desempenho e demais requisitos continuam abertos até as medições.

## Primeira medição da candidata

`cdde7924` passou nos seis gates `43834430236`; a prova focada anterior
`43833205723` compilou programa válido/inválido com WebGL real. JS do jogo:
1.249.100 bytes/345.588 gzip, teto preservado com 900 bytes de margem.

A rodada privada `43835849598`, executor `a4184451`, aprovou compatibilidade,
concorrência e decoração/restauração nos dois formatos. Na entrada: 22 consultas
de ligação somaram 6.151,3 ms; reconexão: 21 somaram 3.665,4 ms; restauração:
23/375,9 ms; histórico: 21/486,9 ms. Não houve consultas de logs nesses recortes.
Os tempos são de executores distintos da referência, sem certificação de FPS
ou ganho universal. A criação falhou: 104 buffers antes, 128 depois. A candidata
não foi adotada nem ativou D3.

O teste de criação passa a conservar escolhas, estado da prévia, contadores e
etapas antes das asserções, inclusive em falha. Aguarda um novo fence realmente
confirmado e o texto de prontidão no mesmo instante; não amplia prazos nem
retira a comparação de buffers/texturas. A próxima rodada deve distinguir
medições em fases diferentes de um vazamento real, sem presumir a causa.


## Quadros confirmados e limite da captura móvel

Fonte `deab8105`, seis gates `43840579768` aprovados; executor privado
`042c0161`, rodada `43844070986`, cinco jornadas aprovadas. As 48 combinações
agora têm observação de quadros reais, escolhas e estado. Depois do aquecimento,
os ciclos conservaram um contexto, 537 buffers e 79 texturas; máximos 612/81.
Esses números são maiores que os da captura anterior, que não exigia desenhar
cada escolha. Não compará-los como regressão nem como economia: o trabalho
observado mudou. A estabilidade desses ciclos não certifica ausência universal
de vazamento.

A inspeção da imagem móvel encontrou uma captura ainda em “Preparando a
prévia”, sem o personagem, depois da troca do viewport. O teste apenas relia
um status que podia ser anterior ao ajuste da câmera. A continuação passa a
esperar confirmações posteriores aos quadros já enviados, incluindo o quadro
em voo, e dois desenhos novos na troca de viewport. Não altera o produto,
não acrescenta espera fixa nem aumenta prazos. A nova captura precisa ser
inspecionada antes de comprovar a aparência móvel.

Nesta rodada, entrada: 21 consultas de ligação/10.567,6 ms; reconexão:
22/11.504,6 ms; restauração: 25/931,3 ms; histórico: 25/917,6 ms. Somente
LINK_STATUS, sem consultas de logs. Os recortes de CPU completos duraram
34.262,034/34.961,703/12.118,615/6.662,828 ms. A variação entre executores e o
custo de ligação continuam relevantes; a mudança não comprovou resolver o
desempenho, nem substitui FPS em hardware real. Candidata continua sem adoção
em produção ou ativação D3.


## Captura móvel depois do ajuste, inspecionada

Fonte `9c329ad3`, seis gates públicos `43846477866` e cinco jornadas privadas
`43847668849` aprovados; executor `afc246b6`. A imagem de criação a 390×844 foi
inspecionada: personagem visível, “Assim vai ficar”, sem o quadro vazio anterior.
O teste observa quadros enviados antes da mudança, incluindo o quadro em voo,
e exige duas confirmações novas depois da troca de viewport. As 48 escolhas e
os limites anteriores continuam exigidos, sem aumento de prazo.

Nos ciclos finais: um contexto, 124 buffers e 33 texturas antes/depois; máximos
199/35. Não comparar essas contagens com as de outro executor como redução de
memória do produto: a mudança só afetou a observação/espera do teste.

Entrada: 21 consultas de ligação/7.924,0 ms; reconexão: 22/11.318,6 ms;
restauração: 23/639,6 ms; histórico: 22/547,0 ms. Sem consultas de logs nesses
recortes. A ligação ainda bloqueia por segundos; desempenho permanece aberto,
sem FPS/hardware certificados, adoção em produção ou ativação D3.

[Prova estruturada](evidencias/previa-quadros-2026-11-16.json). As capturas e os
perfis completos ficam somente no artefato privado e na cópia de trabalho privada.
