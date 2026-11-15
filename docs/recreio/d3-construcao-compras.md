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

Primeiro perfil em preparação em `espaco/colocacao.ts`: móveis no chão do
térreo, dentro do contorno da casa, grade de 500 mm e quatro giros. Confere
volume físico independentemente do bloqueio de navegação, contornos côncavos,
paredes/vãos, entrada, acessos que já existiam, moradores/rotas, uso em curso
ou enfileirado e suporte de enfeites legados. Tapete possui camada explícita de
colisão que admite móvel por cima. Apoios, teto/parede, quintal e andares
adicionais precisam de seus contratos e não são habilitados por esse perfil.
Validação ainda sem integração com comandos, saldo ou formato de mundo.

`2d8ad98d`: os seis gates
[43754875975](https://github.com/informach/informach-apps/actions/runs/43754875975)
aprovaram no GitHub. Nove casos espaciais e oito do protocolo de sequência,
com 162 testes no núcleo, além de tipos, servidor/cliente, integrações,
jornadas, versões e simulação longa. O primeiro candidato espacial parou em
tipagem de uma variável capturada pelo callback de paredes; corrigido com
constante validada, sem cast ou supressão. Isso ainda não comprova o editor,
compras/vendas ou recuperação de uma edição de verdade.

Arquivos novos em `packages/morada-sim/src/espaco/`; consumir
`formatos/imovel.ts`, `espaco/navegador.ts`, `espaco/posicoes.ts`.

- [ ] Validar lote/andar, grade, rotação, pegada transformada e fixação.
- [ ] Construir planta/objetos candidatos sem consumir IDs, dinheiro ou RNG.
- [ ] Conferir colisões, moradores em movimento e nos pontos de uso, acessos
  existentes, portas, contorno e caminhos de entrada/saída.
- [ ] Testar limites tangentes, cantos, quatro giros, objeto não bloqueante,
  porta estreita, bebê no colo, peça ocupada e duas operações incompatíveis.

## 3. Comandos e recibos duráveis

Protocolo escolhido para o editor: cada perfil autorizado mantém uma sequência
inteira segura, iniciada em 1, e no máximo 32 respostas recentes. A chave é
`obra:<sequência em base 36>:<perfil>`; ela não aceita UUID independente da
sequência. A ação estrita conserva o conteúdo e as revisões vistas, sem preços
ou saldo enviados pelo cliente. Repetição recente exige conteúdo idêntico;
repetição antiga é recusada mesmo depois de expirar a resposta. Saltos também
são recusados: duas abas do mesmo autor precisam reler a sequência atual.

O host confere a autorização atual antes de consultar/devolver um recibo.
Resultado recusado por regra, mas admitido nessa sequência, também precisa de
recibo durável: saldo que entrou depois não transforma o reenvio em compra.
O redutor deve conferir a sequência antes de aplicar qualquer saldo/entidade
absolutos; replay já reduzido não volta a aplicar efeitos. Um salto no diário
ou divergência de um recibo recente é corrupção, não autorização de continuar.
Este módulo inicial não habilita comandos nem altera o formato do mundo;
a integração atômica com fatos/fotografia, permissões e editor vem a seguir.

A recuperação atual conserva posições, rotas, ações e ocupações da última
fotografia; esses campos não são reconstituídos pelo diário econômico. Portanto
o fato de edição também precisa conservar a continuidade espacial observada
na admissão. Sem isso, vender um móvel depois que alguém terminou de usá-lo
poderia restaurar a ocupação antiga apontando para um móvel que já foi vendido.
O recibo e os efeitos não podem ser aplicados antes dessa continuidade.
Cobrir fotografia durante uso → fim do uso → venda → queda antes da próxima
foto, além de trajetória antiga cruzando uma compra nova. Medir o tamanho do
fato e recusar antes de emitir se não couber no limite do diário; não contornar
o problema cancelando ações de terceiros, teleportando moradores ou gravando
uma fotografia completa a cada movimento de mouse.

`espaco/continuidade.ts` está em preparação: conserva somente a projeção
espacial de moradores, ações e ocupações, tick e contador de ações. Prepara uma
cópia e confere invariantes antes de permitir a publicação junto do efeito.
Saldo, necessidades, parentesco e identidade familiar não são copiados desse
registro. O pedido de edição passa a fixar família/lote; o recibo conserva as
capacidades que o host admitiu para exigir a autorização atual em um reenvio.
Sem comandos ativados e sem alteração do formato do mundo nesta candidata.

Esse primeiro módulo de continuidade (`6e215d5e`) passou nos seis gates
`43756008227`. A primeira rodada parou na tipagem do teste que acessava um
morador possivelmente ausente; passou a exigir a entidade, sem non-null assertion.

### Integração V3 em preparação, sem publicação

A próxima candidata acrescenta mundo V3 com loja persistida, revisão própria
dos objetos e registros por autor. Migra V1/V2 preservando família, fundação,
aparência, relações, saldo e contadores. O servidor confere a disponibilidade
da arte ao abrir, e o cliente recebe catálogo e próxima sequência própria.

`editar_casa` passa antes da memória genérica: exige sessão, família/lote,
permissão atual e identidade derivada do autor/sequência. Compra exige `gastar`;
movimentações acima de 500 M$ exigem `gerir_financas`, inclusive em reenvios.
Compra, mover/girar, pintar e vender produzem `EdicaoRegistrada`, com recibo e
um efeito absoluto; validação espacial ocorre antes de consumir ID/dinheiro.
Recusa admitida também tem recibo, sem efeito. Fatos grandes são recusados
antes do efeito, respeitando o limite de bytes entregue pelo host.

Respostas recentes: até 32 por autor e 128 no mundo, conservando o piso durável
ao compactar. Histórico admite até 2048 autores distintos e 256 objetos por
lote; atingir o limite recusa a operação, sem apagar sequências. São limites
do primeiro perfil, não capacidade comprovada. Comandos e migração ainda
aguardam os gates públicos, prova de journal/ACK no servidor, editor e
homologação privada antes de qualquer implantação V3. Construção estrutural,
travas de edição, desfazer/refazer e escolha de casas continuam pendentes.

`e9e8d834`: seis gates `43758376732` aprovados, incluindo testes do servidor
com diário indisponível, queda antes/depois da gravação e nova posse sem
duplicar compra. A primeira rodada do núcleo V3 (`d1e5ad43`) passou em 179/180
testes da simulação, mas o ensaio de venda tentava sair da cama enquanto a
ordem explícita de dormir permanecia na fila atual. O teste passou a cancelar
essa ordem pelo comando existente antes de andar; não se alterou a semântica
da fila ou o prazo do ensaio. Núcleo V3 continua fora da main publicada.

Cliente em preparação: chave derivada do jogador/sequência, uma edição em
confirmação por vez, cópia do pedido para que mexer no formulário não altere
o reenvio, e próxima sequência recebida do servidor sem regredir com resposta
antiga. Mensagens de saldo, posição, conflito e confirmação foram acrescentadas.

Achado na composição visual: `ObjetosDeArte` aplica matrizes, mas não a cor
persistida da peça. O caminho procedural não comprova pintura na arte real.
Antes de anunciar/ativar pintura, definir semântica explícita de cor original
versus cor escolhida e os canais que podem mudar, conservar detalhes/material
compartilhados, provar duas instâncias com cores distintas e descarte estável
com os ativos privados. Não multiplicar toda a arte por uma cor e chamar isso
de troca RGB fiel, nem publicar V3 baseado somente no saldo e nos testes do
núcleo. Editor/arte, travas/desfazer e demais critérios deste plano continuam
obrigatórios para D3 integral.

### Pintura: decisão após inventário privado

Inventários privados `43759866252` (`b9f6d8128`) e `43760268212`
(`f2b52ff15`) aprovados no GitHub. Seleção vem das oito ofertas canônicas, com
arte fixa `4f301210…` e código aprovado `e9e8d834`. Só leitura, sem exportar GLB,
sem processamento de arte nesta máquina. Metadados recuperados fora do checkout
público. Os oito móveis usam atlas PNG de 16×16 e materiais opacos de fator
branco; a geladeira tem também vidro transparente separado. Nos vértices
amostrados, zero UV fora do centro do texel e zero triângulo com texels distintos.
A textura usa filtro nearest. Histograma da textura inteira não define canais;
o segundo inventário liga os texels efetivamente usados às primitivas.

Implementação seguinte, antes de publicar Mundo V3:

1. Separar original de escolha explícita: `pintura: null` conserva a arte;
   uma pintura guarda perfil admitido e RGB, inclusive branco/preto. O campo
   legado `cor` não pode fingir ser essa distinção: hoje os dois renderers o
   ignoram. Catálogo de perfis chega do host, é admitido/guardado com recibo e
   não muda preço, saldo ou geometria. Cliente nunca decide máscara ou arquivo.
2. Perfis privados fixam hashes de origem e pigmentos/superfícies. Acrescentar
   atributos próprios de máscara e pesos lineares, preservando textura, UV,
   geometria e vidro. Excluir esses pesos da quantização que perder precisão.
   Máscara por vértice é candidata pelo resultado dos texels; ainda exige
   prova visual e numérica, não aprovação só por contagem.
3. Renderizar grupos originais e pintados em instâncias: RGB por instância,
   máscara compartilhada e materiais próprios do perfil. Não multiplicar o
   RGB nativo pelo alvo; preservar detalhes fora da máscara, alfa, iluminação,
   normais e rugosidade. Não anexar atributos mutáveis de instância à geometria
   compartilhada nem alterar materiais do cache dos demais objetos.
4. Novo perfil de manifesto aceita o pacote anterior. Código compatível entra
   antes da arte; comandos de pintura dependem da disponibilidade real do host.
   Mundo sem pintura continua legível no pacote antigo; mundo pintado exige
   código/pacote compatíveis, sem reset ou fallback silencioso da cor.
5. Gate público: preto/branco/canais zero, comparação do original, duas cores
   independentes, shader básico/padrão e luz/HDR. Gate privado: oito móveis,
   detalhes/vidro conservados, duas instâncias de cada peça, editar/sair/reabrir,
   tamanho do pacote e recursos antes/depois de ciclos. Tudo no GitHub; nenhuma
   alegação de FPS/hardware a partir da renderização por software.

O cliente em `99030597` também passou nos seis gates `43759140904`; continua
em candidata junto do núcleo, sem implantação V3. A fonte em produção segue
`7c81a68f` (portal `59c3b020`, Morada `c69f1531`), conservando o alfa D2.

O contrato de pintura em `d6767dd1` passou nos seis gates `43761541672`.
O próximo candidato acrescenta o preparador do atlas dos móveis e manifesto V4:
receita privada vinculada ao SHA-256, máscara e luminância float32 por vértice,
nenhuma alteração de pixels ou vidro. A preparação recusa UV interpolado,
triângulos com texels distintos, filtros incompatíveis e pigmentos ausentes.
Testes sintéticos incluem serialização GLB e compressão real, preservação do
original, origem alterada e leitura V3/V4. Execução remota ainda pendente para
este incremento. A rodada `43763160598` confirmou tipos, 184 casos do núcleo
e 64 casos do empacotador; falhou em uma asserção que comparava `Buffer` com
`Uint8Array` após GLB. A comparação foi corrigida para exigir os mesmos bytes
no mesmo tipo, mantendo a prova de preservação da imagem. O candidato seguinte
acrescenta o shader de pintura por instância e uma bancada sintética com 20
medições: duas cores independentes, preto/branco/canais zero, HDR, materiais
basic/standard e detalhes fora da máscara. Execução remota pendente.
`715f0615` passou nos seis gates `43763674376`, incluindo as 20 medições
sintéticas e a comparação exata dos bytes da textura. Não comprova a arte real.
O incremento seguinte integra `Objeto.pintura` anulável, catálogo admitido uma
vez por fato do host, validação do perfil instalado ao editar e restaurar,
grupos original/pintado com materiais próprios e reconstrução na mudança de cor.
A admissão acontece após o checkpoint da migração e confirma o journal antes
das boas-vindas. Vidro/detalhes ignoram a cor da instância, inclusive em malhas
com vários materiais. Execução remota deste incremento ainda pendente.
Na primeira rodada (`43764638051`), o CI identificou um import de `listar`
ausente na inicialização e referências ao DTO antigo em testes de conflito e
reenvio. Corrigidos sem mudar as expectativas desses testes; nova rodada exigida.
A rodada `43764819924` identificou o acesso à propriedade V4 em uma união com
manifestos antigos; o leitor agora estreita a entrada antes de validar o perfil.
O ensaio visual foi ampliado para comparar vidro original e vidro em instâncias
com preto/vermelho, exigindo zero alteração nos pixels e no alpha.
A mesma rodada passou tipos e a prova visual; o teste de agrupamento contou
também a malha procedural vazia da bancada. O teste agora delimita as quatro
malhas que usam a geometria real examinada, conservando a exigência de dois
grupos e a prova de descarte dos materiais próprios. Nova rodada pendente.
Como Mundo V3 nunca foi publicado, os candidatos V3 anteriores à pintura não
são destinos válidos de rollback deste contrato; produção continua Mundo V2.
Interface e homologação visual privada permanecem pendentes; não habilitar
pintura nem Mundo V3 em produção com base nestes candidatos.

`5b8f331a`, seis gates `43765644626`: admissão/persistência/renderer integrados,
incluindo o teste de boas-vindas bloqueadas pelo journal. A prova privada
`43766804477` percorreu oito peças e 30 ciclos por peça, sem crescimento nas
geometrias/texturas/programas observados. A comparação inicial usou Mesh cru
como referência contra InstancedMesh, encontrando diferenças em poucos pixels;
a nova rodada usa o renderer de produção dos dois lados, sem elevar tolerâncias.
As oito imagens foram revistas: estofados, estrutura da cama/mesa/rack/geladeira
e moldura do criado delimitados; almofadas, roupa de cama, puxadores e pés de
outra superfície conservados. Vidro também exige a prova sintética já registrada.

Editor em preparação, ainda sem gate: loja e móveis da casa, prévia na mesma
cena/renderer, grade de 0,5 m, giro, pintura admitida, compra e venda confirmadas,
preço/saldo fictícios, teclado/toque e painel responsivo. O rascunho não altera
o espelho; conflito exige revisão explícita e venda exige confirmação separada,
inclusive pelo teclado. A prévia reaproveita os ativos e limita recálculo de
navegação, com autoridade final no servidor. Quatro testes contra a simulação
real e duas jornadas de navegador (computador/celular) aguardam execução remota.
Travas com prazo, desfazer/refazer, orçamento/casas e construção estrutural
continuam pendentes; este editor não conclui sozinho o D3.

Prova privada `43767390595`, executor `730b979f2`, fonte `5b8f331a`: oito peças,
zero erros e **zero pixels diferentes** entre original e V4 sem pintura,
mesmo caminho de instâncias. Trinta ciclos por peça sem crescimento observado
em geometrias, texturas ou programas. [Evidência numérica](evidencias/pintura-moveis-2026-11-15.json);
GLBs, receitas e capturas ficam privados. SwiftShader não certifica FPS real.

Editor `e8cb6dc8`, rodada `43767544522`: qualidade/tipos/testes, integração,
versões, portal e 100 dias aprovados; as duas jornadas novas do editor passaram.
O job cliente falhou depois, no teste de renovação: a pausa aplicada na bancada
compartilhada pelo editor não foi desfeita. O teste agora restaura a velocidade
em `finally`, sem mudar o teste de renovação nem seus limites.

A inspeção das capturas encontrou um problema real: colocação exigia z=0,
mas o piso da casa inicial está a 450 mm. Servidor, rascunho e testes agora usam
`andar.z`; cota diferente do piso é recusada. As bancadas vazias de piso zero
declaram essa altura explicitamente. Capturas também revelaram presença sobre
o relógio no celular e ferramentas cobertas pelo painel; cabeçalho limitado à
largura e trilho reposicionado durante edição. A prévia evita reenviar matrizes
e cores quando nada visível mudou. Novo gate completo ainda pendente.

`33838506`, seis gates `43768738920` aprovados. Cliente: 23 jornadas, incluindo
computador/celular, altura real da compra e renovação após desfazer a pausa;
JS 1.227.906 bytes, 339.289 com gzip, dentro do orçamento vigente. Capturas
sintéticas revistas no executor local sem rodar jogo/testes nesta máquina.
O próximo candidato acrescenta vista superior com retorno à perspectiva e
painel recolhido para deixar a casa visível durante a prévia. As jornadas
também acusam exceções da página e erros de compilação/renderização WebGL.

`63a06893`, seis gates `43770107775` aprovados (disparo manual): vista superior
e painel recolhível verificados nas duas jornadas. Capturas revistas; o próximo
candidato acrescenta contorno da pegada para a prévia continuar identificável
sob o móvel, rótulo estável da vista no celular e orientação em graus.
Inclui a jornada privada `@decoracao`, ainda não executada: comprar/girar/pintar
com arte V4, sair, reiniciar o servidor isolado e conferir saldo, posição,
orientação e preto explícito pela interface. O CI público a omite por não
possuir o pacote licenciado; a prova depende do workflow privado completo.

Antes do corte V3/V4, provar combinações de versões entre portal, cliente e
servidor, incluindo uma aba antiga aberta. Cliente atual lê arte V4, mas uma
aba D2 mantém o leitor antigo. A publicação precisa exigir atualização dessa
aba explicitamente e permitir a transição do cliente novo sobre servidor
anterior, sem interromper o mundo ou apresentar fallback como arte homologada.
O downgrade de mundos V3 continua proibido; não usar backup como rollback de
uma atualização sem um procedimento próprio de recuperação consentida.

### Negociação para o corte V3/V4

Antes de ativar o formato novo, o servidor passa a exigir protocolo 2 no
primeiro quadro, antes de verificar sessão ou admitir um ator. O subprotocolo
WebSocket continua `morada.v1.json`, pois o transporte JSON não muda. O leitor
de entradas reconhece 1/2 para o cliente de transição, mas o host admite só 2.
Uma aba D2 manda 1 e recebe 4008, acionando sua mensagem existente para
recarregar. Não recebe um mundo V3 nem tenta ler o manifesto V4.

O cliente novo tenta 2. Exclusivamente após 4008 **antes de bem-vindo**, pode
repetir uma vez no mesmo endereço com 1, preservando mundo/sessão e sem abrir
outra posse no portal. Isso permite publicar o portal antes do servidor.
Recusa de sessão/permissão, queda, fechamento depois de bem-vindo e boas-vindas
de versão divergente não autorizam essa transição. Segunda recusa encerra;
reabertura normal volta a preferir 2. Não existem fallback de autenticação,
relaxamento de autorização ou downgrade do mundo persistido.

Arquivos: `morada-sim/src/protocolo.ts`, `morada-server/src/instancia.ts`,
`jogo-morada/src/rede/conexao.ts` e testes desses contratos. Provar em GitHub
cliente novo/host novo, cliente novo/host publicado e entrada antiga/host novo,
incluindo ausência de fotografia/admissão no caso incompatível. A bancada
unitária cobre limites da negociação; ela não substitui o binário publicado.

`10b5bbb3`, job versões `132991071457` da rodada `43772419241`: três casos
aprovados contra processos/WebSockets reais, incluindo checkout isolado do
host publicado `7c81a68f`, com dependências próprias. Cliente novo entra/sai
em ambos os hosts; entrada V1 no host novo recebe 4008 sem fotografia ou ator.
[Evidência](evidencias/compatibilidade-morada-2026-11-15.json). Demais gates
da mesma candidata ainda em execução; sem ativação em produção.

Resultado posterior: **seis gates `43772419241` aprovados** para `10b5bbb3`.
Prova privada completa `43772456935` aprovada, fonte `472b3c2e`, executor
`25badb545`: compra azul, giro de 90°, pintura preta sem alterar saldo, saída
e reinício com SIGTERM/checkpoint, reabertura preservando escolhas. Capturas
revistas. Manifesto V4 composto dos artefatos imutáveis, 111 recursos antigos
preservados byte a byte; 56 personagens/48 estilos. As 48 prévias repetiram
um contexto, 537 buffers e 79 texturas antes/depois. [Evidência numérica](evidencias/editor-casa-2026-11-15.json).

Próximo candidato: repetir decoração com arte real em largura de celular e
provar a **cena completa do portal novo** com o build publicado, além do teste
de conexão já aprovado. O auxílio de E2E recebe somente o diretório de outro
build isolado; nenhum ponto de teste foi acrescentado ao produto. O contorno
da prévia passa a não gravar no buffer de profundidade. Sem implantação V3.

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
