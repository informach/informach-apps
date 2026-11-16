# Materiais do corpo no nível baixo

Em investigação, sem ativação. O perfil privado `43817696508` registrou 28,9 s:
16,8 s em `WebGLProgram.getUniforms` e 4,2 s em `texSubImage2D`. O diagnóstico
`43819519629` confirmou SwiftShader, dois núcleos e ausência de
`KHR_parallel_shader_compile`. No Three.js instalado, sem essa extensão,
`compileAsync` não consegue consultar conclusão sem bloqueio e pode deixar o
custo para o primeiro desenho. O tempo em upload não prova textura grande.

Implementação prevista:

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
