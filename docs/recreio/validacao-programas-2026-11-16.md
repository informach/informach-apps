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
