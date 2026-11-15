# D2: criação da família do jogo

Desenho de continuação autorizado pelo titular; **criação ainda não implementada**, preparação da compatibilidade em curso. A família fictícia do Morada não é o grupo de assinatura nem a família real do Recreio. Não reutilizar entidades, cobrança ou autoridade Compasso para representá-la.

**Objetivo:** começar com um ou mais moradores, escolher aparência, fase, traços e relações, conferir casa/orçamento e confirmar uma única criação durável. Mundos existentes conservam seus moradores e histórias.

**Arquitetura:** intenção validada pela simulação pura, autoridade da sessão concedida exclusivamente pelo servidor após conferir o membro, fato crítico persistido antes de confirmar ao cliente e HUD React com prévia somente visual. Arte continua no pacote privado autenticado.

**Tecnologias:** TypeScript/Zod, simulação determinística existente, journal/fotografias atuais, Three.js/React e verificações remotas GitHub. Nenhuma troca de provedor ou banco.

**Escopo de origem:** proposta Morada, seção “Criar a família”, e D2 no [registro](implementacao.md). D3–D8 permanecem obrigatórios e não são concluídos por este incremento.

## Unidades de implementação

1. **Comando e recuperação.** Acrescentar a intenção de criação com `moradorId=null`, limites derivados de `maxMoradoresPorFamilia`, nomes limitados e referências/relações conferidas. O servidor atribui IDs, saldo admissível, lote e permissões; o navegador não envia IDs autoritativos, habilidades livres ou concessões. Validar limites, nomes/referências duplicadas, ciclo de parentesco, relações incompatíveis com fase, lote ocupado e falta de autoridade. O fato e o recibo impedem repetir criação/dinheiro depois de resposta perdida ou reinício.
2. **Compatibilidade persistida.** Antes de introduzir novos fatos, definir a versão de formato que os admite. Uma eventual migração de V1 preserva todos os moradores, relações, contadores e diários legados. Os metadados da fotografia original devem ser conferidos antes de migrá-la; comparar somente o estado já migrado com a versão antiga impediria uma migração legítima. Ao migrar na abertura, publicar fotografia na nova versão antes de admitir comandos, inclusive sem fatos pendentes. A17 impede reabertura por servidor antigo. Cobrir migração, reentrada, mundo futuro e rollback recusado; não aumentar a versão só em uma constante.
3. **Mundo inicial e autoridade.** Separar o bairro inicial sem família do bairro da prova; conservar geometria e IDs de catálogo em uma fonte única. A sessão recebe capacidade de fundar somente da autoridade atual do host, nunca de parâmetro do cliente. A família de exemplo continua como escolha real da criação, sem variável de produção criada apenas para manter testes. Mundos antigos não são zerados. Quem chega por convite sem essa autoridade aguarda ou sai; não assume a criação pelo navegador.
4. **Catálogo e prévia.** Centralizar opções lógicas de aparência/traços e seus limites no conteúdo puro. O pacote D1 atual tem oito personagens completos e não admite qualquer combinação de cabelo/roupa/pele. Ampliar o empacotador e o cliente antes de oferecer combinações que só produziriam fallback procedural. Cor não pode ser identificada por heurística de pixels: preservar a semântica de pele/cabelo/roupa no pacote. Modelos/esqueletos imutáveis podem ser compartilhados; materiais e mutações de cor de cada instância precisam de posse/limpeza próprias. Prévia não escreve no espelho autoritativo nem no banco.
5. **Jornada.** Editor por etapas, começar com um morador permitido, acrescentar/remover até o limite, nomes/fases/traços/aparência, relações, casa e orçamento admissível. Confirmar exibe custo/saldo do jogo, sem confundir com dinheiro real. Mostrar erros do servidor junto da escolha e preservar o rascunho em falhas transitórias; não guardar dados da família em telemetria. Criação só aparece concluída após a confirmação durável. Teclado, foco, nomes acessíveis e saída cooperativa integram a jornada.

## Provas exigidas

Preparação iniciada após a ativação D1: validação compartilhada dos metadados originais antes da migração, usada pelo ator e pelo restaurador operacional; checkpoint quando uma abertura efetivamente atualiza o formato. Mantida versão 1 e comportamento de criação atual. Unidades para metadados adulterados e regressões do servidor em verificação remota; isso não comprova uma migração V1→V2, que só deve ser homologada com o novo formato e os fatos da criação.

- Unidades determinísticas: criação mínima/máxima, limites, relações, autoridade, repetição e invariantes.
- Banco/API/servidor reais no GitHub: fato antes do ACK, perda de resposta, queda entre criação e fotografia, mesmo comando depois da recuperação, concorrência de duas sessões e convite sem capacidade.
- Portal: criar família própria, retomar após sair, segunda pessoa ver o mesmo resultado, nenhuma violação CSP ou dado de conta no jogo.
- Pipeline privado: prévia e personagens escolhidos com arte real, combinações prometidas realmente empacotadas, fases/cores corretas e descarte de recursos. Nada licenciado no GitHub público.
- Repetir os gates aplicáveis e registrar limites. A prova de sete dias/diversão pertence ao D8, e a medição de vídeo integrado permanece adiada por indisponibilidade do aparelho.
