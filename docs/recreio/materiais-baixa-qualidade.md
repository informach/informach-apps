# Materiais do corpo no nível baixo

Experimento rejeitado, sem ativação. O perfil privado `43817696508` registrou 28,9 s:
16,8 s em `WebGLProgram.getUniforms` e 4,2 s em `texSubImage2D`. O diagnóstico
`43819519629` confirmou SwiftShader, dois núcleos e ausência de
`KHR_parallel_shader_compile`. No Three.js instalado, sem essa extensão,
`compileAsync` não consegue consultar conclusão sem bloqueio e pode deixar o
custo para o primeiro desenho. O tempo em upload não prova textura grande.

Implementação experimentada em `7f9a9c87`, seis gates públicos `43822324604`
aprovados:

- `ativos/materiais-simples.ts`: converter somente materiais PBR dos corpos
  para Lambert no nível baixo. Copiar propriedades comuns, cores, mapas,
  transparência, faces, normais e metadados de cor. Compartilhar geometria e
  texturas; materiais novos pertencem ao corpo e são descartados uma vez.
- `Ativos.definirMateriaisSimples?(usar: boolean): boolean`: a escolha vale para
  corpos carregados posteriormente e sinaliza mudança de perfil. Os níveis
  médio/alto conservam os materiais originais. Não detectar o teste por nome.
- `Cena.aplicarQualidade`: se o perfil mudou, pedir a reconstrução visual de
  moradores e prévia dentro do próximo quadro admitido. Não alterar estado,
  posições, aparência escolhida, saldo, esqueleto ou formato do mundo.
- `CorpoDeArte`: aplicar antes de `CoresParametricas`; preservar máscaras,
  paleta, animações e posse dos recursos do pacote. Falha limpa as cópias locais.
- Verificar compartilhamento/isolamento/descarte, propriedades de alpha e
  mapas e a integração com a paleta. Tipos, testes, bundle e jornadas no GitHub;
  comparar imagens privadas e o perfil de CPU na mesma configuração.

Não aumentar o orçamento do bundle, o prazo de interação nem retirar as
asserções de concorrência. A redução precisa ser medida; não é correção
declarada nem certificado de FPS. Hardware real, demais etapas D3 e D2–D8
continuam pendentes.

## Resultado e retirada

A jornada privada `43823529652`, executor `39aa4234`, conservou a mesma
configuração SwiftShader e os prazos. Compatibilidade e decoração/restauração
nos dois formatos passaram, mas a concorrência falhou no botão Pausar após
recarregar. A criação personalizada foi pulada; não há prova das 48 combinações
nessa rodada. A imagem restaurada do celular foi inspecionada e tem três nomes.

O perfil de 34.351,875 ms contém 29.331 amostras: 19.628,173 ms inclusivos em
`getUniforms`, 13.595,716 ms próprios em `getShaderInfoLog`, 6.015,841 ms em
`getProgramInfoLog` e 3.489,232 ms em `texSubImage2D`. A diferença entre dois
executores não é benchmark controlado, mas o bloqueio persistiu: não há evidência
para adotar a conversão. O bundle chegou exatamente ao teto de 1.250.000 bytes.

A conversão Lambert foi retirada da candidata, incluindo as cópias e a recarga
visual que só ela exigia. Mantêm-se os materiais originais e o teto do bundle.
O próximo diagnóstico observa duração e flags conhecidas dos programas no
documento atual, sem armazenar GLSL, nomes de material ou arte, para identificar
qual primeira utilização bloqueia. Não desativa verificações de shader, não muda
resultados WebGL nem amplia prazos; a lentidão continua aberta.

## Escopo da coleta por navegação

A fonte `04d99f70` passou nos seis gates `43825247579` e nas cinco jornadas
privadas `43826248469`, incluindo as 48 combinações sem crescimento de buffers
ou texturas entre os dois pontos medidos. A captura posterior no computador
tem quatro nomes; no celular, três. As imagens foram inspecionadas.

O perfil salvo no fim dessa jornada bem-sucedida corresponde ao último documento
(histórico restaurado), enquanto as falhas anteriores interromperam etapas
anteriores. Seus 4.825,477 ms e as 45 consultas somando 299,4 ms não representam
a mesma etapa da reconexão que falhou; não comparar esses recortes como melhora
de desempenho ou prova de variabilidade do executor.

A coleta passa a encerrar cada perfil antes da próxima navegação, com arquivos
distintos para entrada, reconexão, restauração da compra e restauração do
histórico. A observação WebGL é instalada uma única vez por página, para não
duplicar wrappers/contagens entre etapas. Só o executor privado habilita a
coleta. Os prazos e as asserções de interação permanecem os mesmos.
