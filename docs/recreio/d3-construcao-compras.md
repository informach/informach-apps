# D3: construção e compras — plano de implementação

Execução em série pelo agente principal, com testes e builds somente no GitHub.
O escopo está autorizado; este plano não é uma entrega nem abre vendas.

**Objetivo:** editar a casa e comprar/vender móveis com autorização, saldo,
ocupação, caminhos e recuperação conferidos no servidor.

**Arquitetura:** intenções pedem mudanças; a simulação valida uma cópia candidata
e emite um fato indivisível com resultado absoluto. O ator confirma o diário
antes da resposta. Cliente usa o renderer existente para prévia, sem alterar o
espelho autoritativo ou enviar geometria, preço e saldo como autoridade.

**Tecnologias:** TypeScript puro/Zod no núcleo, servidor Node/WebSocket,
three.js/React no cliente, persistência pela API de instâncias do Recreio.
Sem dependências novas ou acesso do jogo às tabelas da plataforma.

**Especificação:** `paginas/morada.html` v4.4 no `artes-3d`, revisão privada
`4f3012101735ffddd066c31bb0bd8319723eb9ba`; [escopo dos lotes](implementacao.md).

## Contratos que precisam continuar verdadeiros

- Grade de edição de 500 mm; navegação continua em células de 250 mm.
- Uma edição não atravessa moradores, objetos ocupados, portas ou pontos de uso;
  não pode prender alguém ou invalidar uma ação já admitida.
- Toda transação tem autor, identidade durável, versões, saldo e histórico.
  A memória genérica de 512 comandos não basta para impedir compras repetidas
  após recuperação ou expulsão dessa memória.
- Preço e disponibilidade pertencem a conteúdo versionado do servidor.
  Moeda do jogo é independente de Stripe, créditos e dinheiro real.
- Direitos `decorar`, `construir`, `gastar` e `gerir_financas` são distintos.
  O limite de 500 M$ da proposta deve ser aplicado no servidor e mostrado antes
  de confirmar; não inferir administração por controlar um personagem adulto.
- Operações concorrentes usam versão da peça/região. Desfazer afeta somente
  operação do próprio autor ainda compatível, sem restaurar um snapshot antigo
  por cima das ações dos demais.
- Casas, catálogo, versões de conteúdo e recibos sobrevivem à fotografia/diário.
  Migração tem fixture de mundo antigo; downgrade incompatível é recusado.
- Arte, miniaturas e capturas licenciadas ficam no repositório privado.

## 1. Catálogo comercial de conteúdo

Arquivos: `packages/morada-sim/src/conteudo/esquema.ts`,
`conteudo/catalogo/prova.ts`, `conteudo/index.ts`; novos módulos de política de
preço/catálogo junto desse conteúdo. Consumidores: núcleo, servidor e cliente.

- [ ] Separar versão da peça, revisão da entidade e preço do item.
- [ ] Definir rótulo, compra/revenda, variações e fixação admitidas; manter
  peças estruturais fora do catálogo de móveis até terem contrato próprio.
- [ ] Publicar ao cliente somente a seleção disponível na arte homologada;
  garantir funcionamento procedural no CI público.
- [ ] Conferir valores inteiros, limites, IDs e continuidade de catálogo ao
  restaurar. Não substituir silenciosamente conteúdo de um mundo antigo.

## 2. Validação espacial sem efeitos

Arquivos novos em `packages/morada-sim/src/espaco/`; consumir
`formatos/imovel.ts`, `espaco/navegador.ts`, `espaco/posicoes.ts`.

- [ ] Validar lote/andar, grade, rotação, pegada transformada e fixação.
- [ ] Construir planta/objetos candidatos sem consumir IDs, dinheiro ou RNG.
- [ ] Conferir colisões, moradores em movimento e nos pontos de uso, acessos
  existentes, portas, contorno e caminhos de entrada/saída.
- [ ] Testar limites tangentes, cantos, quatro giros, objeto não bloqueante,
  porta estreita, bebê no colo, peça ocupada e duas operações incompatíveis.

## 3. Comandos e recibos duráveis

Arquivos: `comandos/intencao.ts`, `comandos/pipeline.ts`, novo sistema de edição;
`dominio/tipos.ts`, `dominio/fatos.ts`, `dominio/reduzir-fato.ts`,
`dominio/invariantes.ts`, `formatos/fotografia.ts`, `visao/replicacao.ts`.

- [ ] Especificar antes do código o identificador durável por autor e sequência
  monotônica, respostas recentes limitadas e recusa de sequências antigas.
  Reenvio não pode gastar novamente, mesmo após mais de 512 outros comandos.
- [ ] Compra, mover/girar/pintar, venda e edição estrutural passam por autorização
  atual, versões, regra espacial e saldo; nenhum campo monetário vem do cliente.
- [ ] Emitir em um fato a operação, entidades resultantes, saldo absoluto,
  revisões e recibo; invalidar navegação somente depois da admissão.
- [ ] Testar reenvio, resposta perdida, journal confirmado sem ACK, falha antes
  do journal, restauração e revogação enquanto o comando espera.
- [ ] Acrescentar migração e prova de replay idempotente, sem reset do mundo.

## 4. Editor utilizável e concorrência

Arquivos novos em `packages/jogo-morada/src/modelo/`, `hud/` e `cena/`;
compor em `cena/cena.ts` e no controle do cliente, sem renderer adicional.

- [ ] Catálogo por categoria com preço, saldo, seleção, compra/mover, giro,
  cor, venda e confirmação; explicar recusa e conflito sem perder a seleção.
- [ ] Prévia de posição válida/inválida, encaixe na grade, visão superior e
  perspectiva, teclado e toque; impedir ações normais através do painel.
- [ ] Exibir edição dos presentes e trava por região/peça com prazo e geração
  controlados pelo servidor; reconexão não ressuscita uma trava antiga.
- [ ] Desfazer/refazer do próprio autor com pré-condições atuais e compensação
  financeira explícita; sem apagar histórico ou interferir na operação alheia.
- [ ] Escolha de casas/orçamento na criação deve usar este mesmo contrato,
  completando a parte do D2 que hoje apenas revisa a casa inicial e saldo fixos.

## 5. Conteúdo e homologação

- [ ] Completar importador de casas prontas e catálogo para paredes, pisos,
  telhados, portas, janelas, escadas, cercas e peças modulares; validar acesso
  entre andares antes de anunciar suporte a três andares.
- [ ] Gate público: qualidade/tipos, núcleo, integrações, cliente, jornadas e
  100 dias pelo workflow `recreio.yml` em branch candidata.
- [ ] Gate privado: arte real, compra/uso/venda, editar com dois adultos,
  conflito, desfazer do próprio autor, sair/reabrir e recuperar a instância.
- [ ] Medir chamadas de desenho, recursos após ciclos e custo das mudanças;
  desempenho em hardware real continua separado do navegador por software.
- [ ] Revisar diff, integrar na main, conferir plano dos dois serviços e
  implantar em ordem compatível com formato/arte, preservando rollback válido.

## Primeiro candidato: contrato e conteúdo da loja

`comandos/loja.ts` valida formato/política, centavos inteiros seguros, revenda
limitada à compra, IDs únicos e correspondência exata com o catálogo da
simulação e a lista de peças que o host tem disponível. `conteudo/loja.ts`
propõe oito ofertas iniciais, com rótulos e preços fictícios na política 1:
rack 240 M$, sofá 460 M$, mesa lateral 95 M$, poltrona 220 M$, cadeira 90 M$,
cama 650 M$, mesa de cabeceira 120 M$ e geladeira 780 M$; revenda de 50%.
Não são preços de assinatura, oferta comercial ou conversão para dinheiro real.

`cd9e7f3a`: nove casos de validação e cinco gates públicos aprovados em
`43746502172`. Fonte somente na branch candidata `verify/recreio-2026-11-15-d3-catalogo`.
Ainda não expostos no índice público do package, na visão, no mundo ou no
servidor; nenhum comando de compra/venda está habilitado. Persistência da
política, colocação, autorização, recibos e interface continuam pendentes.
