# Recreio — direitos e encerramento, preparação de F7

Estado: levantamento e primeiro componente em candidata. Nenhum dado de produção foi exportado,
alterado ou excluído por esta frente. F7 permanece aberto no fechamento da
plataforma. A implementação continua independente de D3–D8.

## Primeiro componente de leitura pessoal

`features/direitos` prepara em memória um recorte de progresso, versões aceitas,
conflitos e conquistas de um perfil/jogo. Não é a exportação completa da conta;
não tem rota pública, download ou armazenamento de artefato. É um componente
para o coordenador seguinte, sem DDL novo, exclusão ou implantação.

A autoridade exige login nativo recente e vínculo próprio ou responsabilidade
explícita atual sobre o menor; não exige assinatura, perfil ativo ou catálogo
atual do jogo. Titularidade comercial não concede leitura de outro adulto ou
menor. Contexto infantil e aparelho pareado recusam a gestão. Locks de conta,
perfil e responsabilidade precedem o mutex compartilhado com todos os escritores
de dados/conquistas; o aparelho vem depois desse mutex para conservar a ordem.
Prazo/login são relidos depois de esperas e da auditoria, antes de devolver.

Quantidades e tamanhos são conferidos por metadados antes dos bytes; a cópia
confere SHA-256 e presença da revisão atual e não trunca conflitos para aparentar
sucesso. Os limites são as dezesseis chaves/sete versões de 64 KiB existentes,
mais teto explícito de dez mil conquistas. Cota inconsistente ou corrupção recusa
o recorte inteiro. A auditoria estrita guarda somente IDs e contagens.

As novas integrações PostgreSQL verificam separação de adultos/jogos, responsável
sem jogador, mudança de responsabilidade, perfil suspenso sem assinatura,
autoridades restritas, integridade/cota e logout durante espera no escritor.
Precisam de evidência remota própria antes de anunciar o componente validado.
F7 completo ainda depende das etapas abaixo, inclusive todos os demais dados,
mundos, artefatos privados, encerramento e homologação.

## Fonte e fatos existentes

A proposta privada `artes-3d/paginas/recreio.html`, seção de conflitos, exige
acesso/exportação/exclusão antes da venda. Mundos com outros membros permanecem;
o jogo recebe `aoExcluirPerfil`, retira a autoria identificável e revê textos
livres. Não basta remover a linha do perfil ou ocultar o apelido na interface.

O SDK atual possui dados por perfil/jogo com revisão e versões/conflitos,
conquistas, membros de mundos e sessões autoritativas. Os leitores de gameplay
em `features/dados-de-perfil` exigem sessão de jogo e integridade; não servem
como autorização de privacidade para uma conta sem assinatura ou jogador.
O contrato host atual ainda não contém `aoExcluirPerfil` nem exportação pessoal.

`recreio.spaces` conserva `steward_profile_id` e `created_by_profile_id` anuláveis;
a exclusão de perfil não pode apagar o mundo por cascata. O perfil adulto exige
login no schema, e a identidade global também atende outros produtos: apagar
`core.users` não é um encerramento próprio do Recreio. FKs de dados, sessões,
convites, responsabilidade, cobrança e provas precisam ser inventariadas antes
de definir escritores destrutivos. Retenção financeira/auditoria segue contrato
próprio; financiamento guarda fontes de contratos anteriores do mesmo pagante.

## Entregas e ordem técnica

1. Inventariar FKs e escritores atuais por domínio. Fixar quais registros são
   pessoais, compartilhados, técnicos ou financeiros, com proveniência; grupo
   pagante, responsável pelo menor e responsável pelo mundo não são equivalentes.
2. Acrescentar contratos de exportação e retirada de identificadores por jogo,
   com operação/revisão, integridade, limite de bytes e idempotência. Um adapter
   indisponível ou um resultado incompleto não autoriza concluir a exclusão.
3. Preparar pedido nativo de direitos com autenticação recente, escopo completo
   e prévia de dependências. Pagante sem jogador continua elegível. Autoridade
   sobre o próprio adulto e sobre cada menor deve ser relida no servidor;
   participação/cobrança não concede exportação dos dados de outro adulto.
4. Separar preparação de consentimento e execução. Operação versionada e plano
   de efeitos precisam ser persistidos antes do I/O. Não inferir consentimento
   de cancelamento financeiro, saída de grupo ou encerramento global.
5. Congelar as autoridades abrangidas e cortar ingressos/SIDs/aparelhos nas
   mesmas transações apropriadas. Conferir todos os escritores centralizados;
   uma verificação inicial de sessão não protege trabalho retomado depois.
6. Exportar dados próprios e vínculos pessoais por páginas, preservando versões
   e conflitos e conferindo checksums. Conteúdo de terceiros em mundos não vira
   exportação integral por titularidade comercial ou papel de responsável.
   A captura deve ser consistente e limitada; artefato temporário privado e
   download autenticado precisam de retenção e revogação próprias.
7. Coordenar mundos compartilhados com checkpoint, posse/cerca e adapter do
   jogo. Preservar progresso dos outros e impedir um escritor antigo de recolocar
   identificadores depois da limpeza. Fotografias anteriores, diário, resumo,
   textos livres e restauração de backup entram na conferência de resíduos.
8. Resolver saída/sucessão e responsabilidade pelos menores com as concessões
   e aceites existentes. Não fabricar aceite de outro adulto nem transferir
   dados por nome. Pendência explícita impede concluir o pedido incorretamente.
9. Executar limpeza em etapas retomáveis, auditadas por IDs/estado e com recibo
   atômico local. I/O externo exige chave própria; resposta perdida exige leitura
   antes de repetir. Falhas parciais devem falhar HTTP/monitoramento e deixar
   outros pedidos disponíveis. Cobrança e identidade global ficam separadas.
10. Acrescentar telas, status, exportação e confirmação destrutiva concretas,
    prazo/retomada e suporte pelo contato central. Só depois homologar duas
    contas/quatro perfis, restauração e implantação com recursos controlados.

## Provas obrigatórias

- PostgreSQL: escopo de conta/menor/grupo, consentimento divergente, concorrência,
  mudança de responsável, revogação durante I/O, relógios/revisões antigas,
  idempotência, interrupção/retomada e rollback de auditoria.
- Direitos independentes de gameplay: sem assinatura, teste vencido, conta sem
  jogador, aparelho infantil tentando administração e outro adulto/pagante.
- SDK/host: jogo interno de referência e adapter mínimo do Morada atual, sem
  implementar D3–D8. Estado/fotografias/diário preservam dados de outros membros
  e retiram identificadores conforme a política do jogo; legado/texto ambíguo
  precisa de resolução explícita, sem declarar limpeza por mera ausência visual.
- Recuperação: world fence antigo não reintroduz dados; backup restaurado volta
  a aplicar pedidos concluídos antes de servir conteúdo. Cancelar/expirar pedido
  não deixa uma capacidade destrutiva reutilizável.
- Navegador: prévia de dados/impactos, escopo protegido, confirmações separadas,
  status de falha/retomada, download e leitura do recibo; 390 px, CSP e teclado.

Testes pesados, builds, navegador e geração de migrations permanecem no GitHub.
Os scripts de concessão/backup existentes e uma restauração lógica isolada não
comprovam F7. Não ativar venda com base neste documento preparatório.
